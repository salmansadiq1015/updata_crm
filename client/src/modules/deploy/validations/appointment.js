import { z } from 'zod';

const optionalPhone = z
  .union([
    z.string().max(50).regex(/^(\+[1-9]\d{0,2}[\s.\-]?)?(\(?\d{1,4}\)?[\s.\-]?){1,5}\d{1,4}$/, 'Bitte gueltige Telefonnummer eingeben'),
    z.literal(''),
  ])
  .optional();

const optionalEmail = z
  .union([
    z.string().email('Bitte gueltige E-Mail eingeben').max(255),
    z.literal(''),
  ])
  .optional();

export const appointmentSchema = z.object({
  customerContactName: z.string().max(200).optional().or(z.literal('')),
  customerContactPhone: optionalPhone,
  customerContactEmail: optionalEmail,
  appointmentWindow: z.string().max(100).optional().or(z.literal('')),
  confirmationMethod: z.enum(['EMAIL', 'SMS', 'PHONE']).optional().nullable(),
  customerNotes: z.string().max(2000).optional().or(z.literal('')),
});
