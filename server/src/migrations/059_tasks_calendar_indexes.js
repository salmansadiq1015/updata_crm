import Task from '../modules/tasks/task.model.js';
import Assignment from '../modules/deploy/assignment.model.js';
import ScheduleEntry from '../modules/pm/scheduleEntry.model.js';
import logger from '../shared/logger/index.js';

/**
 * Tasks workspace + scheduling calendar read paths.
 * - Task: default list/board page (top-level tasks in manual order), its
 *   "assigned to me" variant, and the dashboard's "recently completed by me".
 * - Assignment: calendar/conflict overlap queries (end > rangeStart, start < rangeEnd),
 *   all employees and per employee.
 * - ScheduleEntry: the calendar's PM overlay ($or of phase overlap / milestone date).
 * Purely additive and idempotent: each index is created only when no index with the same
 * key pattern exists yet. No document is modified; no existing index is dropped.
 * Mirrors the schema.index() declarations in the three models.
 */
export const name = '059_tasks_calendar_indexes';

const INDEXES = [
  [Task, { parentTaskId: 1, isDeleted: 1, sortOrder: 1, _id: 1 }, {}],
  [Task, { assigneeId: 1, parentTaskId: 1, isDeleted: 1, sortOrder: 1, _id: 1 }, {}],
  [Task, { completedBy: 1, status: 1, completedAt: -1, _id: -1 }, {}],
  [Assignment, { isDeleted: 1, endDatetime: 1, startDatetime: 1 }, {}],
  [Assignment, { employeeId: 1, endDatetime: 1, startDatetime: 1 }, {}],
  [ScheduleEntry, { endDate: 1, startDate: 1 }, {}],
  [ScheduleEntry, { milestoneDate: 1 }, {}],
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function existing(model) {
  try { return await model.collection.indexes(); } catch { return []; } // collection may not exist yet
}

export async function up() {
  for (const [model, key, options] of INDEXES) {
    if ((await existing(model)).some((i) => sameKey(i.key, key))) continue;
    await model.collection.createIndex(key, { background: true, ...options });
    logger.info('Tasks/calendar read index created', { module: 'migration', collection: model.collection.name, key });
  }
}

export async function down() {
  for (const [model, key] of INDEXES) {
    const index = (await existing(model)).find((i) => sameKey(i.key, key));
    if (index) await model.collection.dropIndex(index.name);
  }
}

export default { name, up, down };
