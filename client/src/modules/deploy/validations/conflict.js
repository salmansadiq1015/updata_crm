import { z } from 'zod';

export const overrideConflictSchema = z.object({
  overrideReason: z.string().min(10, 'Mindestens 10 Zeichen').max(2000),
});
