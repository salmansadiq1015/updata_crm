import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const CALENDAR_TTL = { l1Ttl: 15, l2Ttl: 60 };

/**
 * Simple hash for cache key generation.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

class CalendarService {
  async getCalendarData(startDate, endDate, { employeeIds, teamId, type, status } = {}) {
    const paramsStr = JSON.stringify({ startDate, endDate, employeeIds, teamId, type, status });
    const cacheKey = `deploy:calendar:${simpleHash(paramsStr)}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        // Lazy imports to avoid circular dependencies
        const assignmentRepository = (await import('./assignment.repository.js')).default;
        const availabilityRepository = (await import('./availability.repository.js')).default;
        const coarseRepository = (await import('./coarse.repository.js')).default;

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Fetch assignments
        const assignments = await assignmentRepository.findByDateRange(start, end, {
          employeeIds,
          type,
          status,
        });

        // Fetch PM construction-schedule entries whose responsibility is an
        // INTERNAL TEAM (responsibleTeamId → User) intersecting this range, so
        // dispatchers see project work alongside deployments. These are owned
        // by PM and are READ-ONLY here (source: 'pm_schedule'); the deploy
        // module never edits/deletes them — the UI deep-links to the project.
        // Failure is non-fatal: the deploy calendar must still render.
        let pmScheduleEntries = [];
        try {
          const scheduleService = (await import('../pm/schedule.service.js')).default;
          pmScheduleEntries = await scheduleService.findInternalTeamEntriesInRange(
            start,
            end,
            employeeIds,
          );
        } catch (err) {
          logger.warn('Failed to load PM schedule entries for deploy calendar (non-blocking)', {
            module: 'deploy',
            action: 'calendar.pmScheduleMerge',
            error: err.message,
          });
        }

        // Fetch availability
        let availability = [];
        if (employeeIds?.length) {
          availability = await availabilityRepository.findByEmployeesAndDateRange(
            employeeIds,
            start,
            end,
          );
        }

        // Fetch coarse allocations if week-level view is relevant
        let coarseAllocations = [];
        try {
          const startWeek = getISOWeek(start);
          const endWeek = getISOWeek(end);
          const year = start.getFullYear();
          coarseAllocations = await coarseRepository.findByWeekRange(
            year,
            startWeek,
            endWeek,
            { employeeIds },
          );
        } catch {
          // coarse data is optional
        }

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

        for (const assignment of assignments) {
          const empId = (assignment.employeeId?._id || assignment.employeeId).toString();
          const name = assignment.employeeId?.firstName
            ? `${assignment.employeeId.firstName} ${assignment.employeeId.lastName}`
            : null;
          ensureEmployee(empId, name).assignments.push(assignment);
        }

        // Merge PM internal-team schedule entries into the same employee rows.
        for (const pmEntry of pmScheduleEntries) {
          if (!pmEntry.employeeId) continue;
          const empId = pmEntry.employeeId.toString();
          ensureEmployee(empId, pmEntry.employeeName).pmScheduleEntries.push(pmEntry);
        }

        for (const avail of availability) {
          const empId = (avail.employeeId?._id || avail.employeeId).toString();
          ensureEmployee(empId, null).availability.push(avail);
        }

        for (const alloc of coarseAllocations) {
          const empId = (alloc.employeeId?._id || alloc.employeeId).toString();
          const name = alloc.employeeId?.firstName
            ? `${alloc.employeeId.firstName} ${alloc.employeeId.lastName}`
            : null;
          ensureEmployee(empId, name).coarseAllocations.push(alloc);
        }

        return Array.from(employeeMap.values());
      },
      CALENDAR_TTL,
    );
  }
}

/**
 * Returns the ISO week number for a given date.
 */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

const calendarService = new CalendarService();
export default calendarService;
