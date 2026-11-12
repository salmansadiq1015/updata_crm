import calendarCache from './calendarCache.js';
import logger from '../../shared/logger/index.js';

const CALENDAR_TTL = { l1Ttl: 15, l2Ttl: 60 };
const MAX_EMPLOYEE_ROWS = 500;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

function idString(value) {
  if (!value) return null;
  return String(value._id || value);
}

class CalendarService {
  /**
   * Employee rows for the scheduling calendar: each row carries the employee's
   * assignments, PM internal-team schedule entries, availability and coarse
   * allocations intersecting [startDate, endDate].
   *
   * - Range semantics: an item is included when it overlaps the range
   *   (start < rangeEnd && end > rangeStart), so multi-day work spanning a range
   *   boundary appears in both adjacent views.
   * - `teamId` (a department name or id) narrows the rows *and* the work shown to
   *   that team's active employees.
   * - Work without an employee (TEAM/DEPARTMENT targets, or an employee whose user
   *   record no longer exists) has no row in this per-employee view and is skipped.
   */
  async getCalendarData(startDate, endDate, { employeeIds, teamId, type, status } = {}) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const requestedIds = [...new Set((employeeIds || []).map(idString).filter(Boolean))].sort();
    const scope = {
      start: start.toISOString(),
      end: end.toISOString(),
      employeeIds: requestedIds,
      teamId: teamId || null,
      type: type || null,
      status: status || null,
    };

    return calendarCache.getOrSet(
      'range',
      scope,
      () => this._loadCalendar(start, end, { requestedIds, teamId, type, status }),
      CALENDAR_TTL,
    );
  }

  async _loadCalendar(start, end, { requestedIds, teamId, type, status }) {
    // Lazy imports to avoid circular dependencies
    const [
      { default: assignmentRepository },
      { default: availabilityRepository },
      { default: coarseRepository },
      { default: User },
    ] = await Promise.all([
      import('./assignment.repository.js'),
      import('./availability.repository.js'),
      import('./coarse.repository.js'),
      import('../auth/user.model.js'),
    ]);

    const employeeFilter = { status: 'active' };
    if (requestedIds.length) employeeFilter._id = { $in: requestedIds };
    if (teamId) employeeFilter.$or = teamFilterClauses(teamId);
    // Promise.resolve: a Mongoose query re-executes on every then(); this one is awaited twice.
    const employeesPromise = Promise.resolve(User.find(employeeFilter)
      .select('firstName lastName email department')
      .sort({ firstName: 1, lastName: 1, _id: 1 })
      .limit(MAX_EMPLOYEE_ROWS)
      .lean());

    // A team filter scopes the work to the team's members; otherwise the explicit
    // employee filter (or none) applies.
    let scopeIds = requestedIds;
    if (teamId) {
      const teamMembers = await employeesPromise;
      scopeIds = teamMembers.map((employee) => String(employee._id));
      if (scopeIds.length === 0) return [];
    }

    const [employeesWithAvailability, assignments, pmScheduleEntries, coarseAllocations] = await Promise.all([
      employeesPromise.then(async (employees) => {
        const availabilityIds = requestedIds.length ? scopeIds : employees.map((employee) => String(employee._id));
        const availability = availabilityIds.length
          ? await availabilityRepository.findByEmployeesAndDateRange(availabilityIds, startOfDay(start), endOfDay(end))
          : [];
        return { employees, availability };
      }),
      assignmentRepository.findByDateRange(start, end, { employeeIds: scopeIds, type, status }),
      // PM construction-schedule entries whose responsibility is an INTERNAL TEAM
      // (responsibleTeamId → User): READ-ONLY here (source: 'pm_schedule'); the UI
      // deep-links to the project. Failure is non-fatal: the calendar must render.
      import('../pm/schedule.service.js')
        .then(({ default: scheduleService }) => scheduleService.findInternalTeamEntriesInRange(start, end, scopeIds))
        .catch((err) => {
          logger.warn('Failed to load PM schedule entries for deploy calendar (non-blocking)', {
            module: 'deploy',
            action: 'calendar.pmScheduleMerge',
            error: err.message,
          });
          return [];
        }),
      // Coarse (weekly) allocations of every ISO week the range touches; optional.
      Promise.all(isoWeekSpans(start, end).map(({ year, weekFrom, weekTo }) => (
        coarseRepository.findByWeekRange(year, weekFrom, weekTo, { employeeIds: scopeIds })
      )))
        .then((chunks) => chunks.flat())
        .catch(() => []),
    ]);
    const { employees, availability } = employeesWithAvailability;

    // Group by employee
    const employeeMap = new Map();

    const ensureEmployee = (empId, name) => {
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employeeId: empId,
          employeeName: name || null,
          availability: [],
          assignments: [],
          coarseAllocations: [],
          pmScheduleEntries: [],
        });
      } else if (name && !employeeMap.get(empId).employeeName) {
        employeeMap.get(empId).employeeName = name;
      }
      return employeeMap.get(empId);
    };

    for (const employee of employees) {
      ensureEmployee(employee._id.toString(), `${employee.firstName} ${employee.lastName}`);
    }

    for (const assignment of assignments) {
      const empId = idString(assignment.employeeId);
      if (!empId) continue;
      const name = assignment.employeeId?.firstName
        ? `${assignment.employeeId.firstName} ${assignment.employeeId.lastName}`
        : null;
      ensureEmployee(empId, name).assignments.push(assignment);
    }

    // Merge PM internal-team schedule entries into the same employee rows.
    for (const pmEntry of pmScheduleEntries) {
      if (!pmEntry.employeeId) continue;
      ensureEmployee(pmEntry.employeeId.toString(), pmEntry.employeeName).pmScheduleEntries.push(pmEntry);
    }

    for (const avail of availability) {
      const empId = idString(avail.employeeId);
      if (!empId) continue;
      ensureEmployee(empId, null).availability.push(avail);
    }

    for (const alloc of coarseAllocations) {
      const empId = idString(alloc.employeeId);
      if (!empId) continue;
      const name = alloc.employeeId?.firstName
        ? `${alloc.employeeId.firstName} ${alloc.employeeId.lastName}`
        : null;
      ensureEmployee(empId, name).coarseAllocations.push(alloc);
    }

    return Array.from(employeeMap.values());
  }
}

/**
 * The calendar's team filter carries the department *name* employees are grouped by
 * (User.department); an ObjectId also matches the preferred department id.
 */
function teamFilterClauses(teamId) {
  const value = String(teamId).trim();
  const clauses = [{ department: value }];
  if (/^[0-9a-fA-F]{24}$/.test(value)) clauses.push({ 'preferences.preferredDepartmentId': value });
  return clauses;
}

/** ISO-8601 week (and its ISO week-year) of a UTC calendar date. */
export function isoWeekOfUtcDate(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  return { year, week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
}

/**
 * ISO weeks touched by [start, end], grouped per ISO week-year
 * ([{ year, weekFrom, weekTo }], at most one span per year).
 *
 * Clients send the range as instants of their local day boundaries (e.g. Monday
 * 00:00 Berlin = Sunday 23:00Z). Each boundary is moved half a day inward before
 * taking its calendar date, which recovers the client's local date for any UTC
 * offset in (-12h, +12h] regardless of the server's own time zone. A range shorter
 * than a day uses its midpoint.
 */
export function isoWeekSpans(start, end) {
  let first = new Date(start.getTime() + HALF_DAY_MS);
  let last = new Date(end.getTime() - HALF_DAY_MS);
  if (last < first) {
    first = new Date((start.getTime() + end.getTime()) / 2);
    last = first;
  }
  const spans = new Map();
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
  const lastDay = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  while (cursor.getTime() <= lastDay) {
    const { year, week } = isoWeekOfUtcDate(cursor);
    const span = spans.get(year);
    if (!span) spans.set(year, { year, weekFrom: week, weekTo: week });
    else {
      span.weekFrom = Math.min(span.weekFrom, week);
      span.weekTo = Math.max(span.weekTo, week);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7 - ((cursor.getUTCDay() + 6) % 7)); // next Monday
  }
  return Array.from(spans.values());
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

const calendarService = new CalendarService();
export default calendarService;
