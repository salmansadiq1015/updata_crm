import { z } from 'zod';

const PHONE = /^(\+[1-9]\d{0,2}[\s.\-]?)?(\(?\d{1,4}\)?[\s.\-]?){1,5}\d{1,4}$/;

const optionalPhone = z
  .union([
    z.string().max(30).regex(PHONE, 'Bitte gültige Telefonnummer eingeben (z.B. +41 44 123 45 67)'),
    z.literal(''),
    z.null(),
  ])
  .optional();

export const createContactSchema = z.object({
  firstName: z.string().trim().min(1, 'Vorname erforderlich').max(100),
  lastName: z.string().trim().min(1, 'Nachname erforderlich').max(100),
  functionTitle: z.string().trim().max(100).nullable().optional().or(z.literal('')),
  siteId: z.string().nullable().optional().or(z.literal('')),
  phone: optionalPhone,
  mobile: optionalPhone,
  email: z.union([z.string().email('Ungültige E-Mail'), z.literal(''), z.null()]).optional(),
  isPrimary: z.boolean().optional().default(false),
  notes: z.string().max(2000).nullable().optional().or(z.literal('')),
});

export const updateContactSchema = createContactSchema.partial();
