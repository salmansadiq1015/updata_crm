import { z } from 'zod';

export const createSiteSchema = z.object({
  name: z.string().trim().min(1, 'Name erforderlich').max(255),
  street: z.string().trim().max(255).optional().or(z.literal('')),
  postalCode: z.string().trim().max(10).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  canton: z.string().trim().max(2).optional().or(z.literal('')),
  country: z.string().trim().length(2).default('CH'),
  floorUnit: z.string().trim().max(100).optional().or(z.literal('')),
  accessInstructions: z.string().max(2000).optional().or(z.literal('')),
  siteType: z.enum(['residential', 'commercial', 'industrial']).default('residential'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export const updateSiteSchema = createSiteSchema.partial();
