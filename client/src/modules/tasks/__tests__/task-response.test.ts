import { expect, it } from 'vitest';
import { rawTaskSchema, rawTaskListSchema } from '../schemas/task-schemas';

it('accepts a task and list from the task APIs without optional metadata', () => {
  expect(rawTaskSchema.parse({ _id: 'task-1', title: 'Prepare client launch', status: 'IN_PROGRESS', priority: 'HIGH', listId: 'list-1', assigneeId: 'user-1', assigneeIds: ['user-1'], dueDate: '2026-11-10T12:00:00.000Z', version: 1 }).id).toBe('task-1');
  expect(rawTaskListSchema.parse({ _id: 'list-1', name: 'Launch operations', openTaskCount: 1 }).name).toBe('Launch operations');
});

it('normalizes missing lifecycle dates and ids to null and retains populated context', () => {
  const task = rawTaskSchema.parse({ _id: 'legacy-task', projectId: { _id: 'project-1', name: 'Launch' } });
  expect(task).toMatchObject({ startDate: null, dueDate: null, completedAt: null, cancelledAt: null, updatedBy: null, lockedBy: null, poolHelperId: null, projectId: 'project-1', projectName: 'Launch' });
});

it('continues to reject invalid statuses and missing task identity', () => {
  expect(() => rawTaskSchema.parse({ _id: 'task', status: 'UNKNOWN' })).toThrow();
  expect(() => rawTaskSchema.parse({ title: 'No id' })).toThrow('Task response is missing an id');
});
