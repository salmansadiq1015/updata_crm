import TaskTimeSession from '../modules/tasks/taskTimeSession.model.js';

export const name = '048_task_time_sessions';
export async function up() {
  await TaskTimeSession.createIndexes();
}
// Retain recorded work during rollback; remove only this feature's indexes.
export async function down() {
  for (const index of ['one_active_task_timer_per_user', 'taskId_1_startedAt_-1', 'userId_1_startedAt_-1']) {
    await TaskTimeSession.collection.dropIndex(index).catch(error => {
      if (![26, 27].includes(error.code)) throw error;
    });
  }
}
export default { name, up, down };
