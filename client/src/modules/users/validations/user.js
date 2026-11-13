import { z } from 'zod';
import { isValidPhone } from '@/lib/formatters/phone';

export function buildUserFormSchema(t = (_key, fallback) => fallback, { isEdit = false, partial = false } = {}) {
  const optionalText = (max) => z.string().max(max, t('users.validation.maxLength', 'Use no more than {count} characters.', { count: max })).optional().or(z.literal(''));
  const base = z.object({
    firstName: z.string().trim().min(1, t('users.validation.firstName', 'Enter a first name.')).max(100),
    lastName: z.string().trim().min(1, t('users.validation.lastName', 'Enter a last name.')).max(100),
    salutation: z.enum(['herr', 'frau']).or(z.literal('')).optional(),
    birthDate: z.string().optional().or(z.literal('')),
    initials: optionalText(5),
    email: z.string().trim().email(t('users.validation.email', 'Enter a valid email address.')),
    phone: z.string().max(30).refine(isValidPhone, t('users.validation.phone', 'Enter a valid phone number, for example +41 79 123 45 67.')).optional().or(z.literal('')),
    department: optionalText(100), position: optionalText(100), street: optionalText(200),
    addressSupplement: optionalText(255), city: optionalText(100), zip: optionalText(20), country: optionalText(100),
    preferredDepartmentId: z.string().nullable().optional().or(z.literal('')),
    skills: z.string().optional().or(z.literal('')),
    certifications: z.string().optional().or(z.literal('')),
    roleId: z.string().min(1, t('users.validation.role', 'Choose a role.')),
    language: z.enum(['de', 'en', 'fr', 'it']).default('de'),
  });
  const password = z.string().min(10, t('users.passwordRequirements', 'Use 10–128 characters with uppercase and lowercase letters, a number and a symbol.'))
      .max(128, t('users.validation.passwordMax', 'Use no more than 128 characters.'))
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{10,}$/, t('users.passwordRequirements', 'Use 10–128 characters with uppercase and lowercase letters, a number and a symbol.'));
  const schema = base.extend({
    password: isEdit ? password.optional().or(z.literal('')) : password,
    confirmPassword: isEdit ? z.string().optional() : z.string().min(1, t('users.validation.confirmPassword', 'Confirm the password.')),
  });
  return (partial ? schema.partial() : schema).refine((data) => (data.password || '') === (data.confirmPassword || ''), {
    path: ['confirmPassword'], message: t('users.validation.passwordMatch', 'Passwords do not match.'),
  });
}

export const createUserSchema = buildUserFormSchema();
export const updateUserSchema = buildUserFormSchema(undefined, { isEdit: true, partial: true }).refine(
  (data) => Object.keys(data).length > 0, { message: 'Change at least one field.' },
);
