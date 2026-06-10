import cacheManager from '../../shared/cache/CacheManager.js';

const DASHBOARD_TTL = { l1Ttl: 15, l2Ttl: 30 };

class DashboardService {
  async getSummary(date) {
    const targetDate = date ? new Date(date) : new Date();
    const dateKey = targetDate.toISOString().split('T')[0];
    const cacheKey = `deploy:dashboard:summary:${dateKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        // Lazy imports to avoid circular dependencies
        const assignmentRepository = (await import('./assignment.repository.js')).default;
        const conflictRepository = (await import('./conflict.repository.js')).default;

        // Count assignments by status for the target date
        const [statusCounts, activeConflicts, unassignedOrders] = await Promise.all([
          assignmentRepository.countByStatus(targetDate),
          conflictRepository.findActive(),
          assignmentRepository.countUnassigned(),
        ]);
        const statusMap = {};
        let total = 0;
        for (const item of statusCounts) {
          statusMap[item.status] = item.count;
          total += item.count;
        }

        // 7-day forecast: count assignments per day for next 7 days
        const upcoming7Days = [];
        for (let i = 0; i < 7; i++) {
          const dayStart = new Date(targetDate);
          dayStart.setDate(dayStart.getDate() + i);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);

          const dayCounts = await assignmentRepository.countByStatus(dayStart);
          const dayTotal = dayCounts.reduce((sum, s) => sum + s.count, 0);
          upcoming7Days.push(dayTotal);
        }

        return {
          date: targetDate.toISOString().split('T')[0],
          assignmentsToday: {
            total,
            planned: statusMap.PLANNED || 0,
            inProgress: statusMap.IN_PROGRESS || 0,
            completed: statusMap.COMPLETED || 0,
            cancelled: statusMap.CANCELLED || 0,
          },
          unassignedOrders,
          activeConflicts: activeConflicts.length,
          upcoming7Days,
        };
      },
      DASHBOARD_TTL,
    );
  }

  async getUtilization(startDate, endDate, employeeIds) {
    const cacheKey = `deploy:dashboard:utilization:${startDate || ''}:${endDate || ''}:${(employeeIds || []).join(',')}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const assignmentRepository = (await import('./assignment.repository.js')).default;

        const start = new Date(startDate);
        const end = new Date(endDate);
        const empIds = employeeIds || [];

        const assignments = await assignmentRepository.findByDateRange(start, end, {
          employeeIds: empIds.length ? empIds : undefined,
        });

        // Group by employee and calculate utilization
        const employeeMap = new Map();
        for (const assignment of assignments) {
          const empId = (assignment.employeeId?._id || assignment.employeeId).toString();
          if (!employeeMap.has(empId)) {
            employeeMap.set(empId, { totalHours: 0 });
          }
          const durationMs = new Date(assignment.endDatetime) - new Date(assignment.startDatetime);
          const hours = durationMs / (1000 * 60 * 60);
          employeeMap.get(empId).totalHours += hours;
        }

        // Calculate working hours in the date range (assume 8h/day, Mon-Fri)
        const totalWorkingDays = countWorkingDays(start, end);
        const workingHours = totalWorkingDays * 8;

        const utilization = [];
        for (const [empId, data] of employeeMap) {
          utilization.push({
            employeeId: empId,
            assignedHours: Math.round(data.totalHours * 100) / 100,
            workingHours,
            percentage: workingHours > 0
              ? Math.round((data.totalHours / workingHours) * 10000) / 100
              : 0,
          });
        }

        return utilization;
      },
      DASHBOARD_TTL,
    );
  }

  async getAlerts() {
    const cacheKey = 'deploy:dashboard:alerts';

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const conflictRepository = (await import('./conflict.repository.js')).default;

        const alerts = [];

        // Active conflicts
        const activeConflicts = await conflictRepository.findActive();
        for (const conflict of activeConflicts) {
          alerts.push({
            type: 'CONFLICT',
            severity: conflict.severity,
            message: conflict.description,
            resourceId: conflict.assignmentId,
            detectedAt: conflict.detectedAt,
          });
        }

        // Unconfirmed appointments within 48h
        try {
          const AppointmentDetails = (await import('./appointmentDetails.model.js')).default;
          const now = new Date();
          const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

          const pendingAppointments = await AppointmentDetails.find({
            confirmationStatus: 'PENDING',
          }).lean();

          // Filter to those with assignments starting within 48h
          if (pendingAppointments.length > 0) {
            const Assignment = (await import('./assignment.model.js')).default;
            for (const appt of pendingAppointments) {
              const assignment = await Assignment.findById(appt.assignmentId).lean();
              if (assignment && assignment.startDatetime <= in48h && assignment.startDatetime >= now) {
                alerts.push({
                  type: 'UNCONFIRMED_APPOINTMENT',
                  severity: 'SOFT',
                  message: `Appointment for assignment ${assignment.assignmentNumber || assignment._id} is unconfirmed and starts within 48 hours`,
                  resourceId: appt.assignmentId,
                  detectedAt: now,
                });
              }
            }
          }
        } catch {
          // appointmentDetails.model.js may not exist yet
        }

        return alerts;
      },
      DASHBOARD_TTL,
    );
  }

  async getUnassignedOrders(limit = 25) {
    const cacheKey = `deploy:dashboard:unassigned:${limit}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const assignmentRepository = (await import('./assignment.repository.js')).default;
        return assignmentRepository.findUnassigned(limit);
      },
      DASHBOARD_TTL,
    );
  }
}

/**
 * Count working days (Mon-Fri) between two dates.
 */
function countWorkingDays(start, end) {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

const dashboardService = new DashboardService();
export default dashboardService;
