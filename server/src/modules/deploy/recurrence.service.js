import { ValidationError } from '../../shared/errors/AppError.js';

const DEFAULT_OPEN_ENDED_OCCURRENCES = 52;
const MAX_RECURRENCE_OCCURRENCES = 365;
const WEEKDAY_INDEX = {
  SU: 0,
  SUN: 0,
  SUNDAY: 0,
  MO: 1,
  MON: 1,
  MONDAY: 1,
  TU: 2,
  TUE: 2,
  TUESDAY: 2,
  WE: 3,
  WED: 3,
  WEDNESDAY: 3,
  TH: 4,
  THU: 4,
  THURSDAY: 4,
  FR: 5,
  FRI: 5,
  FRIDAY: 5,
  SA: 6,
  SAT: 6,
  SATURDAY: 6,
};

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  const targetDay = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== targetDay) next.setDate(0);
  return next;
}

function parseDaysOfWeek(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
    .map((entry) => {
      if (/^[0-6]$/.test(entry)) return Number(entry);
      return WEEKDAY_INDEX[entry];
    })
    .filter((entry) => Number.isInteger(entry));
}

function occurrenceLimit(recurrence) {
  if (!recurrence) return 1;
  if (recurrence.endType === 'AFTER_COUNT') return recurrence.endCount || 1;
  return DEFAULT_OPEN_ENDED_OCCURRENCES;
}

function shouldStopByDate(start, recurrence) {
  if (recurrence?.endType !== 'UNTIL_DATE' || !recurrence.endDate) return false;
  const endDate = new Date(recurrence.endDate);
  endDate.setHours(23, 59, 59, 999);
  return start > endDate;
}

function pushOccurrence(occurrences, start, durationMs, recurrence) {
  if (shouldStopByDate(start, recurrence)) return false;
  occurrences.push({
    startDatetime: new Date(start),
    endDatetime: new Date(start.getTime() + durationMs),
    recurrenceIndex: occurrences.length,
  });
  return occurrences.length < occurrenceLimit(recurrence);
}

class RecurrenceService {
  generateOccurrences(startDatetime, endDatetime, recurrence) {
    const start = new Date(startDatetime);
    const end = new Date(endDatetime);
    const durationMs = end.getTime() - start.getTime();

    if (!recurrence) {
      return [{ startDatetime: start, endDatetime: end, recurrenceIndex: 0 }];
    }

    if (durationMs <= 0) {
      throw new ValidationError('Recurring assignment end date must be after start date');
    }

    const limit = occurrenceLimit(recurrence);
    if (limit > MAX_RECURRENCE_OCCURRENCES) {
      throw new ValidationError(`Recurring assignments are capped at ${MAX_RECURRENCE_OCCURRENCES} occurrences`);
    }

    const interval = Math.max(1, recurrence.interval || 1);
    const occurrences = [];

    if (recurrence.frequency === 'CUSTOM') {
      const weekdays = parseDaysOfWeek(recurrence.daysOfWeek);
      if (weekdays.length === 0) {
        throw new ValidationError('Custom recurrence requires daysOfWeek');
      }

      let cursor = new Date(start);
      let guard = 0;
      while (occurrences.length < limit && guard < MAX_RECURRENCE_OCCURRENCES * 14) {
        const weekDelta = Math.floor((cursor - start) / (7 * 24 * 60 * 60 * 1000));
        if (weekdays.includes(cursor.getDay()) && weekDelta % interval === 0 && cursor >= start) {
          if (!pushOccurrence(occurrences, cursor, durationMs, recurrence)) break;
        }
        cursor = addDays(cursor, 1);
        guard += 1;
      }
      return occurrences;
    }

    let cursor = new Date(start);
    while (occurrences.length < limit) {
      if (!pushOccurrence(occurrences, cursor, durationMs, recurrence)) break;

      if (recurrence.frequency === 'DAILY') {
        cursor = addDays(cursor, interval);
      } else if (recurrence.frequency === 'WEEKLY') {
        cursor = addDays(cursor, interval * 7);
      } else if (recurrence.frequency === 'BIWEEKLY') {
        cursor = addDays(cursor, interval * 14);
      } else if (recurrence.frequency === 'MONTHLY') {
        cursor = addMonths(cursor, interval);
      } else {
        throw new ValidationError(`Unsupported recurrence frequency: ${recurrence.frequency}`);
      }
    }

    return occurrences;
  }
}

const recurrenceService = new RecurrenceService();
export default recurrenceService;
export { DEFAULT_OPEN_ENDED_OCCURRENCES, MAX_RECURRENCE_OCCURRENCES };
