import { z } from 'zod';

const fallbackT = (_key, fallback) => fallback;

const message = (t, key, fallback) => (t || fallbackT)(key, fallback);

const passwordPolicy = (t = fallbackT) => z
  .string()
  .min(10, message(t, 'auth.validation.passwordMin', 'Mindestens 10 Zeichen'))
  .regex(/[A-Z]/, message(t, 'auth.validation.passwordUppercase', 'Mindestens ein Grossbuchstabe'))
  .regex(/[a-z]/, message(t, 'auth.validation.passwordLowercase', 'Mindestens ein Kleinbuchstabe'))
  .regex(/[0-9]/, message(t, 'auth.validation.passwordNumber', 'Mindestens eine Zahl'))
  .regex(/[^A-Za-z0-9]/, message(t, 'auth.validation.passwordSpecial', 'Mindestens ein Sonderzeichen'));

export const createLoginSchema = (t = fallbackT) => z.object({
  email: z
    .string()
    .min(1, message(t, 'auth.validation.emailRequired', 'E-Mail ist erforderlich'))
    .email(message(t, 'auth.validation.emailInvalid', 'Bitte gültige E-Mail-Adresse eingeben')),
  password: z.string().min(1, message(t, 'auth.validation.passwordRequired', 'Passwort ist erforderlich')),
});

export const createChangePasswordSchema = (t = fallbackT) => z.object({
  currentPassword: z.string().min(1, message(t, 'auth.validation.currentPasswordRequired', 'Aktuelles Passwort eingeben')),
  newPassword: passwordPolicy(t),
  confirmPassword: z.string().min(1, message(t, 'auth.validation.confirmPasswordRequired', 'Passwort bestätigen')),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: message(t, 'auth.validation.passwordMismatch', 'Passwörter stimmen nicht überein'),
  path: ['confirmPassword'],
});

export const createResetPasswordRequestSchema = (t = fallbackT) => z.object({
  email: z
    .string()
    .min(1, message(t, 'auth.validation.emailRequired', 'E-Mail ist erforderlich'))
    .email(message(t, 'auth.validation.emailInvalid', 'Bitte gültige E-Mail-Adresse eingeben')),
});

export const createResetPasswordConfirmSchema = (t = fallbackT) => z.object({
  password: passwordPolicy(t),
  confirmPassword: z.string().min(1, message(t, 'auth.validation.confirmPasswordRequired', 'Passwort bestätigen')),
}).refine((data) => data.password === data.confirmPassword, {
  message: message(t, 'auth.validation.passwordMismatch', 'Passwörter stimmen nicht überein'),
  path: ['confirmPassword'],
});

export const createActivateAccountSchema = (t = fallbackT) => z.object({
  password: passwordPolicy(t),
  confirmPassword: z.string().min(1, message(t, 'auth.validation.confirmPasswordRequired', 'Passwort bestätigen')),
}).refine((data) => data.password === data.confirmPassword, {
  message: message(t, 'auth.validation.passwordMismatch', 'Passwörter stimmen nicht überein'),
  path: ['confirmPassword'],
});

export const loginSchema = createLoginSchema();
export const changePasswordSchema = createChangePasswordSchema();
export const resetPasswordRequestSchema = createResetPasswordRequestSchema();
export const resetPasswordConfirmSchema = createResetPasswordConfirmSchema();
export const activateAccountSchema = createActivateAccountSchema();
