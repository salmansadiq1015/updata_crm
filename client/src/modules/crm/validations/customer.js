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
    z.string().max(30).regex(PHONE, 'Bitte gueltige Telefonnummer eingeben (z.B. +41 44 123 45 67)'),
    z.literal(''),
  ])
  .optional();

const optionalEmail = z
  .union([
    z.string().email('Bitte gueltige E-Mail eingeben').max(255),
    z.literal(''),
  ])
  .optional();

const optionalUrl = z
  .union([z.string().url('Bitte gueltige URL').max(255), z.literal('')])
  .optional();

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich').max(255),
  type: z.enum(['private', 'business'], {
    errorMap: () => ({ message: 'Typ ist erforderlich' }),
  }),
  // Address
  street: z
    .string()
    .trim()
    .min(1, 'Strasse ist erforderlich')
    .max(255, 'Strasse darf maximal 255 Zeichen lang sein'),
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
      z.enum(VALID_CANTONS, { errorMap: () => ({ message: 'Bitte gueltigen Kanton waehlen' }) }),
      z.literal(''),
    ])
    .optional(),
  country: z
    .string()
    .length(2, 'Bitte 2-Buchstaben-Laendercode verwenden (z.B. CH, DE)')
    .optional()
    .or(z.literal('')),
  // Contact
  phone: optionalPhone,
  mobile: optionalPhone,
  email: optionalEmail,
  website: optionalUrl,
  // Newsletter
  newsletterOptIn: z.boolean().optional(),
  newsletterChannel: z.enum(['email', 'whatsapp', 'both']).optional(),
  // Notes
  notes: optionalStr(5000),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Mindestens ein Feld muss geaendert werden',
  });
