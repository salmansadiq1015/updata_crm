// Port of client/src/modules/auth/validations/auth.js. The password policy must
// match the server's (min 10, max 128, upper, lower, digit, special character).
import type { TFunction } from 'i18next';
import { z } from 'zod';

const email = (t: TFunction) =>
  z.string().trim().min(1, t('validation.emailRequired')).email(t('validation.emailInvalid'));

const passwordPolicy = (t: TFunction) =>
  z
    .string()
    .min(10, t('validation.passwordMin'))
    .max(128, t('validation.passwordMax'))
    .regex(/[A-Z]/, t('validation.passwordUppercase'))
    .regex(/[a-z]/, t('validation.passwordLowercase'))
    .regex(/[0-9]/, t('validation.passwordNumber'))
    .regex(/[^A-Za-z0-9]/, t('validation.passwordSpecial'));

export const createLoginSchema = (t: TFunction) =>
  z.object({
    email: email(t),
    password: z.string().min(1, t('validation.passwordRequired')),
  });

export const createResetRequestSchema = (t: TFunction) => z.object({ email: email(t) });

export const createResetConfirmSchema = (t: TFunction) =>
  z
    .object({
      password: passwordPolicy(t),
      confirmPassword: z.string().min(1, t('validation.confirmPasswordRequired')),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: t('validation.passwordMismatch'),
      path: ['confirmPassword'],
    });

export type LoginValues = z.infer<ReturnType<typeof createLoginSchema>>;
export type ResetRequestValues = z.infer<ReturnType<typeof createResetRequestSchema>>;
export type ResetConfirmValues = z.infer<ReturnType<typeof createResetConfirmSchema>>;
