import { describe, expect, it } from 'vitest';
import { parseTaskDueInput } from '../utils/task-date-parser';

describe('parseTaskDueInput', () => {
  const sunday = new Date('2026-06-21T10:00:00');

  it('parses today and tomorrow against the local day', () => {
    expect(parseTaskDueInput('today', sunday)).toBe('2026-06-21');
    expect(parseTaskDueInput('tomorrow', sunday)).toBe('2026-06-22');
  });

  it('parses relative day and week expressions', () => {
    expect(parseTaskDueInput('+3d', sunday)).toBe('2026-06-24');
    expect(parseTaskDueInput('2 weeks', sunday)).toBe('2026-07-05');
  });

  it('parses next weekday expressions', () => {
    expect(parseTaskDueInput('next friday', sunday)).toBe('2026-06-26');
    expect(parseTaskDueInput('next sunday', sunday)).toBe('2026-06-28');
  });

  it('returns null for invalid expressions', () => {
    expect(parseTaskDueInput('three days', sunday)).toBeNull();
  });
});
