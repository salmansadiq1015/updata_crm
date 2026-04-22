import { z } from 'zod';

// Matches backend Joi schema: server/src/modules/crm/customer.validation.js
// Fields are lenient to support the "optional or empty string" form pattern.

const optionalStr = (max) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(''));

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
  street: z.string().max(255, 'Strasse darf maximal 255 Zeichen lang sein').optional().or(z.literal('')),
  postalCode: z.string().max(10, 'PLZ darf maximal 10 Zeichen lang sein').optional().or(z.literal('')),
  city: z.string().max(100, 'Ort darf maximal 100 Zeichen lang sein').optional().or(z.literal('')),
  canton: z.string().max(2, 'Bitte gueltigen Kantonscode waehlen (2 Zeichen)').optional().or(z.literal('')),
  country: z
    .string()
    .length(2, 'Bitte 2-Buchstaben-Laendercode verwenden (z.B. CH, DE)')
    .optional()
    .or(z.literal('')),
  // Contact
  phone: optionalStr(30),
  mobile: optionalStr(30),
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
