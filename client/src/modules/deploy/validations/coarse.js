import { z } from 'zod';

const defaultT = (_key, fallback) => fallback;

export function getCreateAllocationSchema(t = defaultT) {
  return z.object({
    employeeId: z.string().min(1, t('deploy.validation.employeeRequiredShort', 'Mitarbeiter ist erforderlich')),
    projectId: z.string().min(1, t('deploy.validation.projectRequired', 'Projekt ist erforderlich')),
    calendarYear: z.coerce.number().int().min(2020).max(2040),
    calendarWeek: z.coerce.number().int().min(1).max(53),
    allocationPercent: z.coerce.number().refine((value) => [25, 50, 75, 100].includes(value), {
      message: t('deploy.validation.allocationPercent', 'Zuteilung muss 25%, 50%, 75% oder 100% sein'),
    }),
    notes: z.string().max(2000).optional().or(z.literal('')),
  });
}

export function getBulkAllocationSchema(t = defaultT) {
  return z.object({
    allocations: z.array(getCreateAllocationSchema(t)).min(1).max(100),
  });
}

export const createAllocationSchema = getCreateAllocationSchema();
export const bulkAllocationSchema = getBulkAllocationSchema();
