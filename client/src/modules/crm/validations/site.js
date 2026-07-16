import { z } from 'zod';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';

const SWISS_POSTAL_CODE = /^[1-9]\d{3}$/;
const VALID_CANTONS = CH_CANTONS.map((c) => c.code);

// Named party + address block (billing / ownership) attached to the object — feedback #10.
const addressParty = z
  .object({
    name: z.string().trim().max(255).optional().or(z.literal('')),
    careOf: z.string().trim().max(255).optional().or(z.literal('')),
    street: z.string().trim().max(255).optional().or(z.literal('')),
    postalCode: z.string().trim().max(10).optional().or(z.literal('')),
    city: z.string().trim().max(100).optional().or(z.literal('')),
    canton: z.union([z.enum(VALID_CANTONS), z.literal('')]).optional(),
  })
  .partial()
  .optional();

export const createSiteSchema = z.object({
  name: z.string().trim().min(1, 'Name erforderlich').max(255),
  street: z.string().trim().max(255).optional().or(z.literal('')),
  postalCode: z
    .union([
      z.string().regex(SWISS_POSTAL_CODE, 'PLZ muss 4 Ziffern sein (1000-9999)'),
      z.literal(''),
    ])
    .optional(),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  canton: z
    .union([
      z.enum(VALID_CANTONS, { errorMap: () => ({ message: 'Bitte gültigen Kanton wählen' }) }),
      z.literal(''),
    ])
    .optional(),
  country: z.string().trim().length(2).default('CH'),
  floorUnit: z.string().trim().max(100).optional().or(z.literal('')),
  accessInstructions: z.string().max(2000).optional().or(z.literal('')),
  siteType: z.enum(['residential', 'commercial', 'industrial']).default('residential'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  billingAddress: addressParty,
  ownership: addressParty,
});

export const updateSiteSchema = createSiteSchema.partial();
