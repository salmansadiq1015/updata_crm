import { z } from 'zod';

const defaultT = (_key, fallback) => fallback;

export function getOverrideConflictSchema(t = defaultT) {
  return z.object({
    overrideReason: z.string()
      .min(10, t('deploy.validation.reasonMin', 'Mindestens 10 Zeichen'))
      .max(2000),
  });
}

export const overrideConflictSchema = getOverrideConflictSchema();
