import { z } from 'zod';

export const createAllocationSchema = z.object({
  employeeId: z.string().min(1, 'Mitarbeiter ist erforderlich'),
  projectId: z.string().min(1, 'Projekt ist erforderlich'),
  calendarYear: z.coerce.number().int().min(2020).max(2040),
  calendarWeek: z.coerce.number().int().min(1).max(53),
  allocationPercent: z.coerce.number().refine((v) => [25, 50, 75, 100].includes(v), {
    message: 'Zuteilung muss 25%, 50%, 75% oder 100% sein',
  }),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const bulkAllocationSchema = z.object({
  allocations: z.array(createAllocationSchema).min(1).max(100),
});
