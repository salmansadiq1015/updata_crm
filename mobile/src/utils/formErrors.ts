import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';

import { fieldErrors } from '@/services/api/apiErrors';

/**
 * Copy server validation details (`error.details[].field`) onto matching form
 * fields. Returns true when at least one field was marked, so the caller can
 * skip a redundant form-level message.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly FieldPath<T>[],
  setError: UseFormSetError<T>,
): boolean {
  const byField = fieldErrors(error);
  let applied = false;
  for (const field of fields) {
    const message = byField[field];
    if (message) {
      setError(field, { type: 'server', message });
      applied = true;
    }
  }
  return applied;
}
