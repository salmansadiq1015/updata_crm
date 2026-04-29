import { z } from 'zod';

export const createTimeEntrySchema = z.object({
  date: z.coerce.date(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullable().optional(),
  breakDurationMin: z.coerce.number().int().min(0).default(0),
  activityType: z.enum(['TRAVEL', 'ONSITE_WORK', 'ADMINISTRATIVE', 'OTHER']),
  note: z.string().max(500).optional().or(z.literal('')),
}).refine(
  (data) => !data.endTime || data.endTime > data.startTime,
  { message: 'Endzeit muss nach Startzeit liegen', path: ['endTime'] }
);

export const updateTimeEntrySchema = createTimeEntrySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Mindestens ein Feld muss geändert werden' }
);
