import { z } from 'zod';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';

// Matches backend Joi schema: server/src/modules/crm/customer.validation.js
// Fields are lenient to support the "optional or empty string" form pattern.

const SWISS_POSTAL_CODE = /^[1-9]\d{3}$/;
const PHONE = /^(\+[1-9]\d{0,2}[\s.\-]?)?(\(?\d{1,4}\)?[\s.\-]?){1,5}\d{1,4}$/;
const VALID_CANTONS = CH_CANTONS.map((c) => c.code);

const optionalStr = (max) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(''));

const optionalPhone = z
  .union([
    z.string().max(30).regex(PHONE, 'Bitte gültige Telefonnummer eingeben (z.B. +41 44 123 45 67)'),
    z.literal(''),
  ])
  .optional();

const optionalEmail = z
  .union([
    z.string().email('Bitte gültige E-Mail eingeben').max(255),
    z.literal(''),
  ])
  .optional();

const optionalUrl = z
  .union([z.string().url('Bitte gültige URL').max(255), z.literal('')])
  .optional();

const customerBaseSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich').max(255),
  type: z.enum(['private', 'business', 'partner', 'supplier'], {
    errorMap: () => ({ message: 'Typ ist erforderlich' }),
  }),
  ownerName: optionalStr(255),
  // Anrede / salutation (client feedback #1) — optional, '' = "none"
  salutation: z.enum(['herr', 'frau', 'familie', 'firma', 'herr_frau', 'frau_herr']).or(z.literal('')).optional(),
  // Address
  street: z
    .string()
    .trim()
    .min(1, 'Strasse ist erforderlich')
    .max(255, 'Strasse darf maximal 255 Zeichen lang sein'),
  addressSupplement: optionalStr(255),
  postalCode: z
    .string()
    .trim()
    .min(1, 'PLZ ist erforderlich')
    .regex(SWISS_POSTAL_CODE, 'PLZ muss 4 Ziffern sein (1000-9999)'),
  city: z
    .string()
    .trim()
    .min(1, 'Ort ist erforderlich')
    .max(100, 'Ort darf maximal 100 Zeichen lang sein'),
  canton: z
    .union([
      z.enum(VALID_CANTONS, { errorMap: () => ({ message: 'Bitte gültigen Kanton wählen' }) }),
      z.literal(''),
    ])
    .optional(),
  country: z
    .string()
    .length(2, 'Bitte 2-Buchstaben-Ländercode verwenden (z.B. CH, DE)')
    .optional()
    .or(z.literal('')),
  // Contact
  phone: optionalPhone,
  mobile: optionalPhone,
  email: optionalEmail,
  website: optionalUrl,
  uidNumber: optionalStr(50),
  vatNumber: optionalStr(50),
  // Newsletter
  newsletterOptIn: z.boolean().optional(),
  newsletterChannel: z.enum(['email', 'whatsapp', 'both']).optional(),
  // Notes
  notes: optionalStr(5000),
});

function requireBusinessIdentity(data, ctx, { requireName = false } = {}) {
  if (data.type !== 'business') return;
  if (requireName && !data.name?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: 'Firmenname ist erforderlich',
    });
  }
  if (!data.ownerName?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ownerName'],
      message: 'Inhabername ist erforderlich',
    });
  }
  if (!data.uidNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['uidNumber'],
      message: 'UID Nummer ist erforderlich',
    });
  }
}

export const createCustomerSchema = customerBaseSchema.superRefine((data, ctx) => {
  requireBusinessIdentity(data, ctx, { requireName: true });
});

export const updateCustomerSchema = customerBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    requireBusinessIdentity(data, ctx);
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Mindestens ein Feld muss geändert werden',
  });
