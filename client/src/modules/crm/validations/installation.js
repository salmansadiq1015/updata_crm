import { z } from 'zod';

export const INSTALLATION_TYPES = [
  'boiler', 'heat_pump', 'solar_thermal', 'radiator_system',
  'ventilation', 'hot_water', 'other',
];

export const FUEL_TYPES = ['gas', 'oil', 'electric', 'pellet', 'other'];

export const createInstallationSchema = z.object({
  type: z.enum(INSTALLATION_TYPES),
  manufacturer: z.string().trim().max(100).optional().or(z.literal('')),
  model: z.string().trim().max(100).optional().or(z.literal('')),
  serialNumber: z.string().trim().max(100).optional().or(z.literal('')),
  commissioningDate: z.string().nullable().optional().or(z.literal('')),
  warrantyEndDate: z.string().nullable().optional().or(z.literal('')),
  powerOutputKw: z.number().nullable().optional(),
  fuelType: z.enum(FUEL_TYPES).nullable().optional(),
  yearOfManufacture: z.number().int().min(1900).max(2100).nullable().optional(),
  technicalNotes: z.string().max(5000).optional().or(z.literal('')),
});

export const updateInstallationSchema = createInstallationSchema.partial();

export const decommissionSchema = z.object({
  reason: z.string().min(1, 'Grund erforderlich').max(500),
});
