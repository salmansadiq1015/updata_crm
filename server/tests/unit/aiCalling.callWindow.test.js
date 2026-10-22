import { describe, expect, it } from '@jest/globals';
import {
  windowState, nextWindowOpen, recipientWindow, recipientTimezone, parseDays, parseHours, isValidTimezone,
} from '../../src/modules/aiCalling/engine/callWindow.js';
import { mapLiveKitWebhook } from '../../src/modules/aiCalling/providers/livekitWebhook.js';
import { normalizeTelephonyStatus } from '../../src/modules/aiCalling/aiCalling.constants.js';

// Monday 2026-10-19 12:00 UTC = 14:00 Zurich (CEST) = 17:00 Karachi.
const MON_NOON_UTC = new Date('2026-10-19T12:00:00Z');

describe('campaign call window', () => {
  it('opens inside the window and reports a delay outside it', () => {
    const schedule = { timezone: 'Europe/Zurich', callWindow: { start: '09:00', end: '18:00' }, daysOfWeek: [1, 2, 3, 4, 5] };
    expect(windowState(schedule, MON_NOON_UTC)).toEqual({ open: true, delayMs: 0 });
    const evening = windowState(schedule, new Date('2026-10-19T17:30:00Z')); // 19:30 Zurich
    expect(evening.open).toBe(false);
    expect(evening.delayMs).toBeGreaterThan(0);
    expect(windowState(schedule, new Date('2026-10-18T12:00:00Z')).open).toBe(false); // Sunday
  });

  it('fails CLOSED on an invalid timezone (never dials at an unknown local time)', () => {
    const res = windowState({ timezone: 'Mars/Olympus', callWindow: { start: '00:00', end: '23:59' } }, MON_NOON_UTC);
    expect(res.open).toBe(false);
    expect(res.invalidTimezone).toBe(true);
    expect(isValidTimezone('Europe/Zurich')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });
});

describe('recipient local quiet hours', () => {
  it('applies the recipient country timezone, not the campaign one', () => {
    expect(recipientTimezone('pk')).toBe('Asia/Karachi');
    // 21:30 Karachi on Monday → closed under the default 08:00-20:00.
    expect(recipientWindow('PK', { now: new Date('2026-10-19T16:30:00Z') }).open).toBe(false);
    expect(recipientWindow('CH', { now: MON_NOON_UTC })).toMatchObject({ known: true, open: true, timezone: 'Europe/Zurich' });
  });

  it('is "unknown" (campaign window only) for multi-timezone countries', () => {
    expect(recipientWindow('US', { now: MON_NOON_UTC })).toMatchObject({ known: false, open: true });
  });

  it('honours operator overrides and defaults to Mon–Sat', () => {
    expect(recipientWindow('CH', { hours: '15:00-16:00', now: MON_NOON_UTC }).open).toBe(false);
    expect(recipientWindow('CH', { now: new Date('2026-10-18T12:00:00Z') }).open).toBe(false); // Sunday
    expect(recipientWindow('CH', { days: '0', now: new Date('2026-10-18T12:00:00Z') }).open).toBe(true);
  });

  it('parses config defensively (blank days must not mean "Sunday")', () => {
    expect(parseDays(undefined)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseDays('')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseDays('1, 2,,9,x')).toEqual([1, 2]);
    expect(parseHours('nonsense')).toEqual({ start: '08:00', end: '20:00' });
  });
});

describe('LiveKit webhook mapping', () => {
  const room = { name: 'crm-call-call_abc_1_ff' };
  const sip = (extra) => ({ kind: 'SIP', identity: 'sip-call_abc_1_ff', sid: 'PA_1', ...extra });

  it('a SIP participant joining while dialling is NOT an answer', () => {
    expect(mapLiveKitWebhook({ event: 'participant_joined', room, participant: sip({ attributes: { 'sip.callStatus': 'dialing' } }) }))
      .toMatchObject({ internalCallId: 'call_abc_1_ff', eventType: 'ringing' });
    expect(mapLiveKitWebhook({ event: 'participant_joined', room, participant: sip({ attributes: { 'sip.callStatus': 'active', 'sip.callID': 'SCL_9' } }) }))
      .toMatchObject({ eventType: 'answered', providerCallId: 'SCL_9' });
  });

  it('maps SIP disconnect reasons to call outcomes', () => {
    const left = (reason) => mapLiveKitWebhook({ event: 'participant_left', room, participant: sip({ disconnectReason: reason }) }).eventType;
    expect(left('USER_REJECTED')).toBe('busy');
    expect(left('USER_UNAVAILABLE')).toBe('no-answer');
    expect(left('SIP_TRUNK_FAILURE')).toBe('failed');
    expect(left('CLIENT_INITIATED')).toBe('completed');
    expect(normalizeTelephonyStatus('no-answer')).toBe('no_answer');
    expect(normalizeTelephonyStatus('answered')).toBe('in_progress');
    expect(normalizeTelephonyStatus('participant_joined')).toBeNull();
  });

  it('room_finished ends the call; agent participants and foreign rooms are ignored', () => {
    expect(mapLiveKitWebhook({ event: 'room_finished', room }).eventType).toBe('completed');
    expect(mapLiveKitWebhook({ event: 'participant_left', room, participant: { kind: 'AGENT', identity: 'agent-1' } }).eventType).toBe('ignored');
    expect(mapLiveKitWebhook({ event: 'room_finished', room: { name: 'other-room' } }).internalCallId).toBeNull();
  });
});

describe('next calling-window opening (shown to people)', () => {
  const karachi = { timezone: 'Asia/Karachi', callWindow: { start: '09:00', end: '19:00' }, daysOfWeek: [1, 2, 3, 4, 5, 6] };

  it('after hours it is the next day\'s start, not the one-hour re-check hint', () => {
    // Wed 21 Oct 2026 22:48 Karachi.
    expect(nextWindowOpen(karachi, new Date('2026-10-21T17:48:00Z'))?.toISOString()).toBe('2026-10-22T04:00:00.000Z');
  });

  it('skips excluded days and returns now when already open', () => {
    // Sat 24 Oct 20:00 Karachi, Sunday excluded → Mon 26 Oct 09:00.
    expect(nextWindowOpen(karachi, new Date('2026-10-24T15:00:00Z'))?.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    const open = new Date('2026-10-22T05:00:00Z');
    expect(nextWindowOpen(karachi, open)).toBe(open);
  });

  it('follows DST and returns null when the window can never open', () => {
    const zurich = { timezone: 'Europe/Zurich', callWindow: { start: '09:00', end: '19:00' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
    // Night of the 25 Oct 2026 change (CEST → CET): 09:00 local is 08:00 UTC.
    expect(nextWindowOpen(zurich, new Date('2026-10-24T22:00:00Z'))?.toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(nextWindowOpen({ ...zurich, daysOfWeek: [9] }, new Date())).toBeNull();
  });
});
