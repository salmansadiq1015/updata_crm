// Working-day helpers for the overdue task pool. Weekends (Sat/Sun) are skipped;
// public holidays are not modelled (a good-enough approximation for pooling).

export function subtractWorkingDays(date, workingDays) {
  const result = new Date(date);
  let remaining = Math.max(0, workingDays);
  while (remaining > 0) {
    result.setDate(result.getDate() - 1);
    const day = result.getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

// The latest due date for which a task is already overdue by at least
// `workingDays` business days relative to `now`.
export function poolCutoffDate(now, workingDays) {
  return subtractWorkingDays(now, workingDays);
}
