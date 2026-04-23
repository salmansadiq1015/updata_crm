import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid ID');

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: z.string().max(5000).nullable().optional(),
  projectType: z.enum(['NEW_INSTALLATION', 'RENOVATION', 'MAINTENANCE', 'SERVICE_CONTRACT', 'OTHER']),
  customerId: objectId,
  siteId: objectId.nullable().optional(),
  projectManagerId: objectId,
  teamId: objectId.nullable().optional(),
  plannedStartDate: z.coerce.date().nullable().optional(),
  plannedEndDate: z.coerce.date().nullable().optional(),
  estimatedBudget: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().trim().max(3).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const projectStep1Schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  projectType: z.enum(['NEW_INSTALLATION', 'RENOVATION', 'MAINTENANCE', 'SERVICE_CONTRACT', 'OTHER']),
  description: z.string().max(5000).nullable().optional(),
});

export const projectStep2Schema = z.object({
  customerId: objectId,
  siteId: objectId.nullable().optional(),
});

export const projectStep3Schema = z.object({
  projectManagerId: objectId,
  plannedStartDate: z.coerce.date().nullable().optional(),
  plannedEndDate: z.coerce.date().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.plannedStartDate && data.plannedEndDate) {
    if (new Date(data.plannedEndDate) <= new Date(data.plannedStartDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be after start date',
        path: ['plannedEndDate'],
      });
    }
  }
});

export const projectStep4Schema = z.object({
  estimatedBudget: z.coerce.number().min(0).max(999999999, 'Budget too large').nullable().optional(),
  currency: z.string().trim().max(3).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  projectType: z.enum(['NEW_INSTALLATION', 'RENOVATION', 'MAINTENANCE', 'SERVICE_CONTRACT', 'OTHER']).optional(),
  customerId: objectId.optional(),
  siteId: objectId.nullable().optional(),
  projectManagerId: objectId.optional(),
  teamId: objectId.nullable().optional(),
  plannedStartDate: z.coerce.date().nullable().optional(),
  plannedEndDate: z.coerce.date().nullable().optional(),
  actualStartDate: z.coerce.date().nullable().optional(),
  actualEndDate: z.coerce.date().nullable().optional(),
  estimatedBudget: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().trim().max(3).optional(),
  notes: z.string().max(5000).nullable().optional(),
});
