import { z } from 'zod';

export const recurrenceSchema = z.object({
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM'], {
    errorMap: () => ({ message: 'Häufigkeit ist erforderlich' }),
  }),
  interval: z.coerce.number().int().min(1).max(52).default(1),
  daysOfWeek: z.string().max(30).optional().or(z.literal('')),
  endType: z.enum(['NEVER', 'AFTER_COUNT', 'UNTIL_DATE']).default('NEVER'),
  endCount: z.coerce.number().int().min(1).max(365).optional().nullable(),
  endDate: z.string().optional().or(z.literal('')).nullable(),
}).refine(
  (data) => data.endType !== 'AFTER_COUNT' || (data.endCount && data.endCount > 0),
  { message: 'Anzahl Wiederholungen ist erforderlich', path: ['endCount'] }
).refine(
  (data) => data.endType !== 'UNTIL_DATE' || (data.endDate && data.endDate.length > 0),
  { message: 'Enddatum ist erforderlich', path: ['endDate'] }
);
