import { previewWithLink, personalize, unknownPlaceholders } from '@/features/smsQueue/domain/smsQueue';

import { funnelStage, groupReminders } from '../domain';

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
