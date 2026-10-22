import { previewWithLink, personalize, unknownPlaceholders } from '@/features/smsQueue/domain/smsQueue';

import { funnelStage, funnelTimeline, groupReminders } from '../domain';

describe('SMS link assistant (mobile)', () => {
  it('keeps {link} for the CRM, fills {company}, and previews a realistic link', () => {
    const text = personalize('Hi {name}, {company}: {link}', { name: 'Ali', city: null }, 'Sunrise Solar');
    expect(text).toBe('Hi Ali, Sunrise Solar: {link}');
    expect(unknownPlaceholders('Hi {name} {link} {company}')).toEqual([]);
    expect(previewWithLink(text, 'https://upd.example/')).toMatch(
      /^Hi Ali, Sunrise Solar: https:\/\/upd\.example\/c\/[0-9A-Za-z]{22}$/,
    );
  });

  it('shows the furthest funnel stage', () => {
    expect(funnelStage({ status: 'issued', funnel: { sms_sent: '2026-10-22' } })).toBe('sent');
    expect(funnelStage({ status: 'active', funnel: { link_opened: 'x', chat_started: 'y' } })).toBe(
      'started',
    );
    expect(funnelStage({ status: 'completed', funnel: {} })).toBe('completed');
    expect(funnelStage({ status: 'opted_out', funnel: { completed: null } })).toBe('opted_out');
    expect(funnelStage({ status: 'expired', funnel: {} })).toBe('closed');
  });

  it('groups due reminders per campaign without duplicate leads', () => {
    const due = [
      {
        campaignId: 'a',
        campaignName: 'Solar',
        leadId: 'l1',
        sessionId: 's1',
        status: 'opened',
        remindersSent: 0,
      },
      {
        campaignId: 'a',
        campaignName: 'Solar',
        leadId: 'l2',
        sessionId: 's2',
        status: 'issued',
        remindersSent: 0,
      },
      {
        campaignId: 'b',
        campaignName: 'Water',
        leadId: 'l1',
        sessionId: 's3',
        status: 'issued',
        remindersSent: 1,
      },
    ];
    expect(groupReminders(due)).toEqual([
      { campaignId: 'a', campaignName: 'Solar', leadIds: ['l1', 'l2'] },
      { campaignId: 'b', campaignName: 'Water', leadIds: ['l1'] },
    ]);
  });
});

describe('funnel timeline', () => {
  it('never marks "delivered" when only the SMS send was recorded', () => {
    const steps = funnelTimeline({ status: 'issued', funnel: { link_issued: 'a', sms_sent: '2026-10-22T08:00:00Z' } });
    expect(steps.map((s) => [s.key, s.reached])).toEqual([
      ['sent', true],
      ['delivered', false],
      ['opened', false],
      ['started', false],
      ['completed', false],
    ]);
    expect(steps[0]!.at).toBe('2026-10-22T08:00:00Z');
  });

  it('ends with the real outcome: completed, opted out or closed', () => {
    expect(funnelTimeline({ status: 'completed', funnel: { sms_sent: 'a', completed: 'b' } }).at(-1)).toEqual({
      key: 'completed',
      at: 'b',
      reached: true,
    });
    expect(funnelTimeline({ status: 'opted_out', funnel: { opted_out: 'c' } }).at(-1)).toEqual({
      key: 'opted_out',
      at: 'c',
      reached: true,
    });
    expect(funnelTimeline({ status: 'expired', funnel: { expired: 'd' } }).at(-1)).toMatchObject({
      key: 'closed',
      reached: true,
    });
  });
});
