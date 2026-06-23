import { z } from 'zod';

export const createUserSchema = z.object({
  firstName: z.string().min(1, 'Vorname ist erforderlich').max(100),
  lastName: z.string().min(1, 'Nachname ist erforderlich').max(100),
  email: z.string().email('Bitte gültige E-Mail-Adresse eingeben'),
  phone: z.string().max(30).optional().or(z.literal('')),
  department: z.string().max(100).optional().or(z.literal('')),
  position: z.string().max(100).optional().or(z.literal('')),
  street: z.string().max(200).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  zip: z.string().max(20).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  preferredDepartmentId: z.string().nullable().optional().or(z.literal('')),
  roleId: z.string().min(1, 'Rolle ist erforderlich'),
  language: z.string().default('de'),
});

export const updateUserSchema = createUserSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Mindestens ein Feld muss geändert werden' }
);
