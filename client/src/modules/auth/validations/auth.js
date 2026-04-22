import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'E-Mail ist erforderlich').email('Bitte gültige E-Mail-Adresse eingeben'),
  password: z.string().min(1, 'Passwort ist erforderlich'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Aktuelles Passwort eingeben'),
  newPassword: z
    .string()
    .min(10, 'Mindestens 10 Zeichen')
    .regex(/[A-Z]/, 'Mindestens ein Grossbuchstabe')
    .regex(/[a-z]/, 'Mindestens ein Kleinbuchstabe')
    .regex(/[0-9]/, 'Mindestens eine Zahl')
    .regex(/[^A-Za-z0-9]/, 'Mindestens ein Sonderzeichen'),
  confirmPassword: z.string().min(1, 'Passwort bestätigen'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwörter stimmen nicht überein',
  path: ['confirmPassword'],
});

// Shared password policy for reuse
const passwordPolicy = z
  .string()
  .min(10, 'Mindestens 10 Zeichen')
  .regex(/[A-Z]/, 'Mindestens ein Grossbuchstabe')
  .regex(/[a-z]/, 'Mindestens ein Kleinbuchstabe')
  .regex(/[0-9]/, 'Mindestens eine Zahl')
  .regex(/[^A-Za-z0-9]/, 'Mindestens ein Sonderzeichen');

export const resetPasswordRequestSchema = z.object({
  email: z.string().min(1, 'E-Mail ist erforderlich').email('Bitte gültige E-Mail-Adresse eingeben'),
});

export const resetPasswordConfirmSchema = z.object({
  password: passwordPolicy,
  confirmPassword: z.string().min(1, 'Passwort bestätigen'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwörter stimmen nicht überein',
  path: ['confirmPassword'],
});

export const activateAccountSchema = z.object({
  password: passwordPolicy,
  confirmPassword: z.string().min(1, 'Passwort bestätigen'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwörter stimmen nicht überein',
  path: ['confirmPassword'],
});
