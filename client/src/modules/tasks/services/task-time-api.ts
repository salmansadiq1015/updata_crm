import apiClient from '@/lib/api/client';
import { activeTaskTimerSchema, taskTimeSummarySchema, type TimerStartInput } from '../types/task-time-types';

const data = (response: unknown) => (response as { data: unknown }).data;
const activeData = (response: unknown) => ({ ...activeTaskTimerSchema.parse(data(response)), receivedAt: performance.now() });
export const taskTimeApi = {
  async active() {
    return activeData(await apiClient.get('/tasks/time-tracking/active'));
  },
  async start({ taskId, ...body }: TimerStartInput) {
    return activeData(await apiClient.post(`/tasks/${taskId}/time-tracking/start`, body));
  },
  async transition(sessionId: string, action: 'pause' | 'resume' | 'stop', note?: string) {
    return activeData(await apiClient.post(`/tasks/time-tracking/sessions/${sessionId}/${action}`, note === undefined ? {} : { note }));
  },
  async summary(taskId: string, page: number) {
    return taskTimeSummarySchema.parse(data(await apiClient.get(`/tasks/${taskId}/time-tracking`, { params: { page, days: 0 } })));
  },
  async report(days: number, scope: 'mine' | 'team') {
    return taskTimeSummarySchema.parse(data(await apiClient.get('/tasks/time-tracking/report', { params: { days, scope } })));
  },
};
