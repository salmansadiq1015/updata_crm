import { describe, expect, it } from 'vitest';
import {
  formatAppointmentTimeWindow,
  getAppointmentTimeWindowPresetKey,
  isValidAppointmentTimeRange,
  parseAppointmentTimeWindow,
} from '../utils/appointment-time-window';

describe('appointment time window utilities', () => {
  it('formats a selected range for the existing assignment API contract', () => {
    expect(formatAppointmentTimeWindow('08:00', '12:00')).toBe('08:00-12:00');
  });

  it('parses saved windows with loose spacing and single-digit hours', () => {
    expect(parseAppointmentTimeWindow('8:00 - 12:00')).toEqual({
      start: '08:00',
      end: '12:00',
    });
  });

  it('detects preset and custom time windows', () => {
    expect(getAppointmentTimeWindowPresetKey('08:00-12:00')).toBe('morning');
    expect(getAppointmentTimeWindowPresetKey('09:00-11:30')).toBe('custom');
  });

  it('rejects ranges where the end is not after the start', () => {
    expect(isValidAppointmentTimeRange('14:00', '12:00')).toBe(false);
    expect(isValidAppointmentTimeRange('12:00', '12:00')).toBe(false);
    expect(isValidAppointmentTimeRange('08:00', '12:00')).toBe(true);
  });
});
