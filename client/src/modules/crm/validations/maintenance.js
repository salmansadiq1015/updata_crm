import { z } from 'zod';

export const MAINTENANCE_TYPES = [
  'annual_service', 'filter_change', 'chimney_sweep',
  'general_inspection', 'other',
];

export const MAINTENANCE_STATUSES = ['ok', 'due', 'overdue', 'scheduled'];

export const createMaintenanceSchema = z.object({
  maintenanceType: z.enum(MAINTENANCE_TYPES),
  customTypeLabel: z.string().trim().max(100).optional().or(z.literal('')),
  frequencyMonths: z.number().int().min(1).max(120),
  lastServiceDate: z.string().nullable().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const updateMaintenanceSchema = createMaintenanceSchema.partial().extend({
  maintenanceStatus: z.enum(MAINTENANCE_STATUSES).optional(),
});
