import { z } from 'zod';

export const SPARE_PART_CATEGORIES = [
  'filter', 'gasket', 'pump_part', 'valve', 'sensor',
  'igniter', 'burner_part', 'control_board', 'other',
];

export const createSparePartSchema = z.object({
  partNumber: z.string().trim().min(1, 'Teilenummer erforderlich').max(100),
  name: z.string().trim().min(1, 'Name erforderlich').max(255),
  description: z.string().max(2000).optional().or(z.literal('')),
  manufacturer: z.string().trim().max(255).optional().or(z.literal('')),
  category: z.enum(SPARE_PART_CATEGORIES),
  unitPrice: z.number().min(0).nullable().optional(),
  currency: z.string().max(3).default('CHF'),
  unit: z.string().max(20).default('pcs'),
  minStockLevel: z.number().min(0).default(0),
  currentStock: z.number().min(0).default(0),
  supplierId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional().or(z.literal('')),
  supplierPartNumber: z.string().max(100).optional().or(z.literal('')),
  compatibleInstallationTypes: z.array(z.string().trim().max(50)).default([]),
  isActive: z.boolean().default(true),
});

export const updateSparePartSchema = createSparePartSchema.partial();

export const linkSparePartSchema = z.object({
  sparePartId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Ungültige Ersatzteil-ID'),
  quantity: z.number().int().min(1).default(1),
  lastReplacedDate: z.string().nullable().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});
