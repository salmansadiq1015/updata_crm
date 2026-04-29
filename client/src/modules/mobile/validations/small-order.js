import { z } from 'zod';

export const createSmallOrderSchema = z.object({
  title: z.string().min(1, 'Titel erforderlich').max(255),
  description: z.string().max(5000).optional().or(z.literal('')),
  assignedTo: z.string().min(1, 'Zuweisung erforderlich'),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  dueDate: z.coerce.date().optional().nullable(),
});
