import { describe, expect, test } from 'vitest';
import { fieldOpsTimeFormSchema } from '../components/time/field-ops-time-form-dialog';

const entry = {
  orderId: 'order-1', date: '2026-11-02', startTime: '09:00', endTime: '10:00',
  breakDurationMin: '15', activityType: 'work', note: 'On-site service',
};

describe('complete field time form', () => {
  test('loads and accepts an entry with both steps populated', () => {
    expect(fieldOpsTimeFormSchema.parse(entry)).toMatchObject({ activityType: 'work', breakDurationMin: 15 });
  });

  test('retains the end-after-start constraint after adding activity fields', () => {
    const result = fieldOpsTimeFormSchema.safeParse({ ...entry, endTime: '08:00' });
    expect(result.success).toBe(false);
    expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['endTime'] }));
  });

  test('still requires an activity from the second step', () => {
    expect(fieldOpsTimeFormSchema.safeParse({ ...entry, activityType: '' }).success).toBe(false);
  });
});
