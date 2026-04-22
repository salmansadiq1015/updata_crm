import { z } from 'zod';

const emptyToNull = (v) => (v === '' ? null : v);

export const createContactSchema = z.object({
  firstName: z.string().trim().min(1, 'Vorname erforderlich').max(100),
  lastName: z.string().trim().min(1, 'Nachname erforderlich').max(100),
  functionTitle: z.string().trim().max(100).nullable().optional().or(z.literal('')),
  phone: z.string().trim().max(30).nullable().optional().or(z.literal('')),
  mobile: z.string().trim().max(30).nullable().optional().or(z.literal('')),
  email: z.union([z.string().email('Ungültige E-Mail'), z.literal(''), z.null()]).optional(),
  isPrimary: z.boolean().optional().default(false),
  notes: z.string().max(2000).nullable().optional().or(z.literal('')),
});

export const updateContactSchema = createContactSchema.partial();
