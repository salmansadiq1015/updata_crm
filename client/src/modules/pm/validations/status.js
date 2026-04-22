import { z } from 'zod';

export const transitionStatusSchema = z.object({
  targetStatus: z.enum(['DRAFT', 'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']),
  comment: z.string().max(2000).nullable().optional(),
  override: z.boolean().optional().default(false),
  overrideReason: z.string().max(2000).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.override && !data.overrideReason) {
    ctx.addIssue({ code: 'custom', path: ['overrideReason'], message: 'Override reason is required when overriding' });
  }
  if (data.targetStatus === 'ON_HOLD' && !data.comment) {
    ctx.addIssue({ code: 'custom', path: ['comment'], message: 'Comment is required when pausing a project' });
  }
});
