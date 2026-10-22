import {
  advanceBlocker,
  callEvidence,
  campaignActions,
  campaignProgress,
  clampCountdown,
  missingRequiredQuestions,
  suggestOutcome,
  visibleQuestions,
  ymdInZone,
  zonedWallTimeToIso,
  callWindowOpen,
} from '../domain/campaignDomain';
import type { CampaignQuestion } from '../types';

const q = (fieldKey: string, order: number, extra: Partial<CampaignQuestion> = {}): CampaignQuestion => ({
  fieldKey,
  label: fieldKey,
  text: `${fieldKey}?`,
  description: '',
  type: 'short_text',
  required: false,
  order,
  options: [],
  condition: null,
  ...extra,
});

describe('campaign rules', () => {
  it('offers only the lifecycle actions the server accepts', () => {
    expect(campaignActions('draft')).toEqual(['start', 'cancel']);
    expect(campaignActions('running')).toEqual(['pause', 'cancel', 'retry']);
    expect(campaignActions('paused')).toEqual(['resume', 'cancel', 'retry']);
    expect(campaignActions('completed')).toEqual(['retry']);
    expect(campaignActions('cancelled')).toEqual([]);
  });

  it('applies skip rules exactly like the server (ordered, condition on earlier answers)', () => {
    const conditional = [
      q('tags', 1, { type: 'multiple_choice' }),
      q('detail', 2, {
        condition: { all: [{ field: 'tags', contains: 'repairs' }] },
      }),
    ];
    expect(
      visibleQuestions(conditional, { tags: { status: 'answered', value: ['repairs'] } }).map(
        (q) => q.fieldKey,
      ),
    ).toEqual(['tags', 'detail']);
    expect(visibleQuestions(conditional, { tags: { status: 'unknown' } }).map((q) => q.fieldKey)).toEqual([
      'tags',
    ]);
    const questions = [
      q('budget', 3, { condition: { all: [{ field: 'interest', in: ['high', 'medium'] }] } }),
      q('owner', 1, { type: 'boolean' }),
      q('interest', 2, { type: 'single_choice', options: ['high', 'medium', 'low'] }),
      q('decider', 4, { condition: { all: [{ field: 'owner', equals: false }] } }),
    ];
    expect(visibleQuestions(questions, {}).map((x) => x.fieldKey)).toEqual(['owner', 'interest']);
    const shown = visibleQuestions(questions, {
      owner: { status: 'answered', value: 'no' },
      interest: { status: 'answered', value: 'high' },
    });
    expect(shown.map((x) => x.fieldKey)).toEqual(['owner', 'interest', 'budget', 'decider']);
    // "Don't know" does not satisfy a skip rule.
    expect(visibleQuestions(questions, { interest: { status: 'unknown' } }).map((x) => x.fieldKey)).toEqual([
      'owner',
      'interest',
    ]);
  });

  it('converts an explicit wall-clock time in a timezone, never guessing', () => {
    expect(zonedWallTimeToIso('2026-02-30', '10:00', 'UTC')).toBeNull();
    expect(zonedWallTimeToIso('2026-10-20', '24:00', 'UTC')).toBeNull();
    expect(zonedWallTimeToIso('2026-03-29', '02:30', 'Europe/Zurich')).toBeNull();
    expect(zonedWallTimeToIso('2026-10-25', '02:30', 'Europe/Zurich')).toBeNull();
    expect(zonedWallTimeToIso('2026-10-20', '10:00', 'Asia/Karachi')).toBe('2026-10-20T05:00:00.000Z');
    expect(zonedWallTimeToIso('2026-10-20', '10:00', 'Europe/Zurich')).toBe('2026-10-20T08:00:00.000Z');
    // Across the Zurich DST switch (25 Oct 2026): winter time is UTC+1.
    expect(zonedWallTimeToIso('2026-10-26', '10:00', 'Europe/Zurich')).toBe('2026-10-26T09:00:00.000Z');
    expect(zonedWallTimeToIso('2026-10-20', '10', 'UTC')).toBeNull();
    expect(zonedWallTimeToIso('2026-10-20', '10:00', 'Not/AZone')).toBeNull();
    expect(ymdInZone(new Date('2026-10-20T20:30:00Z'), 'Asia/Karachi')).toBe('2026-10-21');
  });

  it('requires visible required answers and permits explicit unknown', () => {
    const questions = [
      q('owner', 1, { required: true }),
      q('followup', 2, { required: true, condition: { all: [{ field: 'owner', equals: 'yes' }] } }),
    ];
    expect(missingRequiredQuestions(questions, {})).toEqual(['owner']);
    expect(missingRequiredQuestions(questions, { owner: { status: 'unknown' } })).toEqual([]);
    expect(missingRequiredQuestions(questions, { owner: { status: 'answered', value: 'yes' } })).toEqual([
      'followup',
    ]);
  });

  it('treats off-hook → idle as "call over", never as "answered"', () => {
    const ev = callEvidence(
      [
        { operationId: 'a', state: 'offhook', at: 1_000, source: 'telephony_callback' },
        { operationId: 'a', state: 'idle', at: 46_000, source: 'telephony_callback' },
      ],
      0,
    );
    expect(ev).toEqual({ offhookAt: 1_000, endedAt: 46_000, offhookDurationSec: 45, ended: true });
    expect(
      callEvidence([{ operationId: 'a', state: 'offhook', at: 1_000, source: 'telephony_callback' }]).ended,
    ).toBe(false);
    expect(suggestOutcome(null)).toEqual({ outcome: null, evidence: 'user' });
    expect(suggestOutcome({ found: true, durationSec: 0 })).toEqual({ outcome: null, evidence: 'call_log' });
    expect(suggestOutcome({ found: true, durationSec: 30 })).toEqual({
      outcome: 'answered',
      evidence: 'call_log',
    });
  });

  it('blocks progression for every unsafe condition', () => {
    const ok = {
      campaignStatus: 'running' as const,
      online: true,
      resultSynced: true,
      callEnded: true,
      outcomeRecorded: true,
      userPaused: false,
    };
    expect(advanceBlocker(ok)).toBeNull();
    expect(advanceBlocker({ ...ok, userPaused: true })).toBe('user_paused');
    expect(advanceBlocker({ ...ok, campaignStatus: 'paused' })).toBe('campaign_not_running');
    expect(advanceBlocker({ ...ok, campaignStatus: 'cancelled' })).toBe('campaign_not_running');
    expect(advanceBlocker({ ...ok, callEnded: false })).toBe('call_not_ended');
    expect(advanceBlocker({ ...ok, outcomeRecorded: false })).toBe('outcome_missing');
    expect(advanceBlocker({ ...ok, online: false })).toBe('offline');
    expect(advanceBlocker({ ...ok, resultSynced: false })).toBe('result_not_synced');
  });

  it('clamps the countdown and computes progress', () => {
    expect(clampCountdown(1)).toBe(3);
    expect(clampCountdown(500)).toBe(120);
    expect(clampCountdown(10)).toBe(10);
    expect(campaignProgress({ total: 10, completed: 4, skipped: 1, ineligible: 1, cancelled: 0 })).toEqual({
      closed: 6,
      remaining: 4,
      ratio: 0.6,
    });
  });
});

describe('callWindowOpen (warning only; the server gate decides)', () => {
  const hours = { start: '09:00', end: '19:00' };
  const weekdays = [1, 2, 3, 4, 5, 6];
  it('open in the daytime, closed after hours and on excluded days (Asia/Karachi)', () => {
    expect(callWindowOpen(hours, weekdays, 'Asia/Karachi', new Date('2026-10-21T05:00:00Z'))).toBe(true); // Wed 10:00
    expect(callWindowOpen(hours, weekdays, 'Asia/Karachi', new Date('2026-10-21T17:48:00Z'))).toBe(false); // Wed 22:48
    expect(callWindowOpen(hours, weekdays, 'Asia/Karachi', new Date('2026-10-25T05:00:00Z'))).toBe(false); // Sun
  });
  it('supports overnight windows and rejects an unknown timezone', () => {
    expect(
      callWindowOpen(
        { start: '22:00', end: '02:00' },
        [0, 1, 2, 3, 4, 5, 6],
        'UTC',
        new Date('2026-10-21T23:30:00Z'),
      ),
    ).toBe(true);
    expect(callWindowOpen(hours, weekdays, 'Mars/Base', new Date())).toBe(false);
  });
});
