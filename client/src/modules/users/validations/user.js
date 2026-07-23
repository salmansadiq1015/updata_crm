import { z } from 'zod';
import { isValidPhone } from '@/lib/formatters/phone';

export const createUserSchema = z.object({
  firstName: z.string().min(1, 'Vorname ist erforderlich').max(100),
  lastName: z.string().min(1, 'Nachname ist erforderlich').max(100),
  salutation: z.enum(['herr', 'frau']).or(z.literal('')).optional(),
  email: z.string().email('Bitte gültige E-Mail-Adresse eingeben'),
  phone: z.string().max(30)
    .refine(isValidPhone, 'Ungültige Telefonnummer (z. B. 079 123 45 67 oder +41 79 123 45 67)')
    .optional().or(z.literal('')),
  department: z.string().max(100).optional().or(z.literal('')),
  position: z.string().max(100).optional().or(z.literal('')),
  street: z.string().max(200).optional().or(z.literal('')),
  addressSupplement: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  zip: z.string().max(20).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  preferredDepartmentId: z.string().nullable().optional().or(z.literal('')),
  // Comma-separated in the form; mapped to schedulingSkills/-Certifications arrays on submit.
  skills: z.string().optional().or(z.literal('')),
  certifications: z.string().optional().or(z.literal('')),
  roleId: z.string().min(1, 'Rolle ist erforderlich'),
  language: z.string().default('de'),
});

export const updateUserSchema = createUserSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Mindestens ein Feld muss geändert werden' }
);
