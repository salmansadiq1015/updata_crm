const DEFAULT_LIMIT = 80;
const DEFAULT_WORKDAY_HOURS = 8;
const ABSENCE_TYPES = new Set(['VACATION', 'SICK', 'OTHER_ABSENCE', 'PUBLIC_HOLIDAY', 'COMPANY_CLOSURE']);

function normalizeId(value) {
  if (!value) return null;
  return String(value._id || value);
}

function normalizeCapabilityList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || '').split(',');

  return raw
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function buildName(employee) {
  return `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
}

function normalizeDate(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function listRangeDates(start, end) {
  const dates = [];
  const current = normalizeDate(start);
  const last = normalizeDate(end);

  while (current <= last) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function parseTimeToMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getWeekdayCapacityHours(start, end) {
  return listRangeDates(start, end).reduce((hours, date) => {
    const day = date.getDay();
    return day === 0 || day === 6 ? hours : hours + DEFAULT_WORKDAY_HOURS;
  }, 0);
}

function getAvailabilityCapacityHours(records, start, end) {
  const rangeKeys = new Set(listRangeDates(start, end).map((date) => date.toISOString().slice(0, 10)));
  let hasWorkingRecord = false;
  let hours = 0;

  for (const record of records) {
    const key = new Date(record.date).toISOString().slice(0, 10);
    if (!rangeKeys.has(key) || record.availabilityType !== 'WORKING') continue;

    const startMinutes = parseTimeToMinutes(record.workStart);
    const endMinutes = parseTimeToMinutes(record.workEnd);
    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) continue;

    hasWorkingRecord = true;
    hours += (endMinutes - startMinutes) / 60;
  }

  return hasWorkingRecord ? hours : getWeekdayCapacityHours(start, end);
}

function assignmentOverlapHours(assignment, start, end) {
  const overlapStart = Math.max(new Date(assignment.startDatetime).getTime(), start.getTime());
  const overlapEnd = Math.min(new Date(assignment.endDatetime).getTime(), end.getTime());
  return Math.max(0, (overlapEnd - overlapStart) / 3_600_000);
}

function missingCapabilities(required, actual) {
  const actualSet = new Set(normalizeCapabilityList(actual).map((item) => item.toLowerCase()));
  return normalizeCapabilityList(required).filter((item) => !actualSet.has(item.toLowerCase()));
}

function buildCapabilityWarnings(employee, requirements) {
  const missingSkills = [
    ...missingCapabilities(requirements.requiredSkills, employee.schedulingSkills),
    ...missingCapabilities(requirements.recommendedSkills, employee.schedulingSkills),
  ];
  const missingCertifications = [
    ...missingCapabilities(requirements.requiredCertifications, employee.schedulingCertifications),
    ...missingCapabilities(requirements.recommendedCertifications, employee.schedulingCertifications),
  ];

  const warnings = [];
  const uniqueMissingSkills = [...new Set(missingSkills)];
  const uniqueMissingCertifications = [...new Set(missingCertifications)];

  if (uniqueMissingSkills.length) {
    warnings.push({
      conflictType: 'SKILL_MISMATCH',
      severity: 'SOFT',
      description: `Missing skill match: ${uniqueMissingSkills.join(', ')}`,
    });
  }

  if (uniqueMissingCertifications.length) {
    warnings.push({
      conflictType: 'CERTIFICATION_MISSING',
      severity: 'SOFT',
      description: `Missing certification match: ${uniqueMissingCertifications.join(', ')}`,
    });
  }

  return warnings;
}

function buildAvailabilityConflicts(records, assignments, start, end) {
  const conflicts = [];

  for (const record of records) {
    if (!ABSENCE_TYPES.has(record.availabilityType)) continue;
    conflicts.push({
      conflictType: 'ABSENCE',
      severity: 'HARD',
      description: `Employee on ${record.availabilityType} on ${new Date(record.date).toISOString().slice(0, 10)}`,
    });
  }

  for (const assignment of assignments) {
    conflicts.push({
      conflictType: 'DOUBLE_BOOKING',
      severity: 'SOFT',
      description: `Overlaps with '${assignment.title || assignment.assignmentNumber}'`,
      conflictingWithId: assignment._id,
    });
  }

  const startDateKey = normalizeDate(start).toISOString().slice(0, 10);
  const startAvailability = records.find((record) => (
    new Date(record.date).toISOString().slice(0, 10) === startDateKey &&
    record.availabilityType === 'WORKING' &&
    record.workStart &&
    record.workEnd
  ));

  if (startAvailability) {
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const workStart = parseTimeToMinutes(startAvailability.workStart);
    const workEnd = parseTimeToMinutes(startAvailability.workEnd);
    if (workStart != null && workEnd != null && (startMinutes < workStart || endMinutes > workEnd)) {
      conflicts.push({
        conflictType: 'WORKING_HOURS',
        severity: 'SOFT',
        description: `Outside working hours (${startAvailability.workStart}-${startAvailability.workEnd})`,
      });
    }
  }

  return conflicts;
}

function getAvailabilityStatus(conflicts, hasRange) {
  if (!hasRange) return 'UNKNOWN';
  if (conflicts.some((conflict) => conflict.severity === 'HARD')) return 'UNAVAILABLE';
  if (conflicts.length > 0) return 'WARNING';
  return 'AVAILABLE';
}

class DeployEmployeeService {
  async list(query = {}) {
    const { default: User } = await import('../auth/user.model.js');
    const assignmentRepository = (await import('./assignment.repository.js')).default;
    const availabilityRepository = (await import('./availability.repository.js')).default;

    const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, 100);
    const start = query.startDatetime ? new Date(query.startDatetime) : null;
    const end = query.endDatetime ? new Date(query.endDatetime) : null;
    const hasRange = Boolean(start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()));
    const includeEmployeeIds = normalizeCapabilityList(query.includeEmployeeIds);

    const filter = { status: 'active' };
    if (query.search) {
      const search = String(query.search).trim();
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } },
      ];
    }
    if (query.teamId) {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { department: query.teamId },
            { 'preferences.preferredDepartmentId': query.teamId },
          ],
        },
      ];
    }

    const baseEmployees = await User.find(filter)
      .select('firstName lastName email department position role schedulingSkills schedulingCertifications')
      .populate('role', 'name')
      .sort({ firstName: 1, lastName: 1 })
      .limit(limit)
      .lean();

    let includedEmployees = [];
    const baseIds = new Set(baseEmployees.map((employee) => normalizeId(employee._id)));
    const missingIncludedIds = includeEmployeeIds.filter((id) => !baseIds.has(id));
    if (missingIncludedIds.length > 0) {
      includedEmployees = await User.find({ _id: { $in: missingIncludedIds }, status: 'active' })
        .select('firstName lastName email department position role schedulingSkills schedulingCertifications')
        .populate('role', 'name')
        .lean();
    }

    const employees = [...baseEmployees, ...includedEmployees];
    const employeeIds = employees.map((employee) => normalizeId(employee._id)).filter(Boolean);

    let assignments = [];
    let availability = [];
    if (hasRange && employeeIds.length > 0) {
      [assignments, availability] = await Promise.all([
        assignmentRepository.findByDateRange(start, end, { employeeIds }),
        availabilityRepository.findByEmployeesAndDateRange(employeeIds, normalizeDate(start), normalizeDate(end)),
      ]);
      assignments = assignments.filter((assignment) => assignment.status !== 'CANCELLED');
    }

    const assignmentsByEmployee = new Map();
    for (const assignment of assignments) {
      const employeeId = normalizeId(assignment.employeeId);
      if (!employeeId) continue;
      if (!assignmentsByEmployee.has(employeeId)) assignmentsByEmployee.set(employeeId, []);
      assignmentsByEmployee.get(employeeId).push(assignment);
    }

    const availabilityByEmployee = new Map();
    for (const record of availability) {
      const employeeId = normalizeId(record.employeeId);
      if (!employeeId) continue;
      if (!availabilityByEmployee.has(employeeId)) availabilityByEmployee.set(employeeId, []);
      availabilityByEmployee.get(employeeId).push(record);
    }

    const requirements = {
      requiredSkills: normalizeCapabilityList(query.requiredSkills),
      recommendedSkills: normalizeCapabilityList(query.recommendedSkills),
      requiredCertifications: normalizeCapabilityList(query.requiredCertifications),
      recommendedCertifications: normalizeCapabilityList(query.recommendedCertifications),
    };

    return employees.map((employee) => {
      const employeeId = normalizeId(employee._id);
      const employeeAssignments = assignmentsByEmployee.get(employeeId) || [];
      const employeeAvailability = availabilityByEmployee.get(employeeId) || [];
      const availabilityConflicts = hasRange
        ? buildAvailabilityConflicts(employeeAvailability, employeeAssignments, start, end)
        : [];
      const qualificationConflicts = buildCapabilityWarnings(employee, requirements);
      const conflicts = [...availabilityConflicts, ...qualificationConflicts];
      const assignedHours = hasRange
        ? employeeAssignments.reduce((sum, assignment) => sum + assignmentOverlapHours(assignment, start, end), 0)
        : 0;
      const capacityHours = hasRange
        ? getAvailabilityCapacityHours(employeeAvailability, start, end)
        : 0;

      return {
        _id: employeeId,
        id: employeeId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        fullName: buildName(employee),
        email: employee.email,
        department: employee.department || null,
        position: employee.position || null,
        roleName: employee.role?.name || null,
        schedulingSkills: employee.schedulingSkills || [],
        schedulingCertifications: employee.schedulingCertifications || [],
        availability: {
          status: getAvailabilityStatus(conflicts, hasRange),
          conflicts,
          records: employeeAvailability,
        },
        workload: {
          assignedHours: Math.round(assignedHours * 100) / 100,
          capacityHours: Math.round(capacityHours * 100) / 100,
          utilizationPercent: capacityHours > 0
            ? Math.round((assignedHours / capacityHours) * 10_000) / 100
            : 0,
          assignmentCount: employeeAssignments.length,
          assignments: employeeAssignments.slice(0, 3).map((assignment) => ({
            _id: normalizeId(assignment._id),
            assignmentNumber: assignment.assignmentNumber,
            title: assignment.title,
            status: assignment.status,
            startDatetime: assignment.startDatetime,
            endDatetime: assignment.endDatetime,
          })),
        },
      };
    });
  }
}

const deployEmployeeService = new DeployEmployeeService();
export default deployEmployeeService;
