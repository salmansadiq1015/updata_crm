import { z } from 'zod';

export const taskTimeSessionSchema = z.object({
  id: z.string(), taskId: z.string(), taskTitle: z.string(), userId: z.string(),
  status: z.enum(['RUNNING', 'PAUSED', 'STOPPED']), mode: z.enum(['TIMER', 'FOCUS']),
  targetMinutes: z.number(), startedAt: z.string(), stoppedAt: z.string().nullable().default(null),
  elapsedMs: z.number().nonnegative(), pauseCount: z.number().default(0), note: z.string().default(''),
  stopReason: z.string().nullable().default(null), userName: z.string().optional(),
});
const metrics = {
  totalMs: z.number(), sessionCount: z.number(), activeCount: z.number(), focusCount: z.number(),
  taskCount: z.number(), averageSessionMs: z.number(), averageTaskMs: z.number(),
};
export const taskTimeSummarySchema = z.object({
  ...metrics, asOf: z.string(), days: z.number(), myTotalMs: z.number(),
  employees: z.array(z.object({ ...metrics, userId: z.string(), name: z.string(), lastStartedAt: z.string() })),
  sessions: z.array(taskTimeSessionSchema), page: z.number(), hasMore: z.boolean(),
});
export const activeTaskTimerSchema = z.object({ session: taskTimeSessionSchema.nullable(), asOf: z.string() });
export type TaskTimeSession = z.infer<typeof taskTimeSessionSchema>;
export type TaskTimeSummary = z.infer<typeof taskTimeSummarySchema>;
export type ActiveTaskTimer = z.infer<typeof activeTaskTimerSchema>;
export type TimerStartInput = { taskId: string; mode: 'TIMER' | 'FOCUS'; targetMinutes: number };
