import type { DueReminder, LinkSession } from './types';

export type FunnelStage =
  | 'issued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'started'
  | 'completed'
  | 'opted_out'
  | 'closed';

/** The furthest point the lead reached, for a one-word status. */
export function funnelStage(session: Pick<LinkSession, 'status' | 'funnel'>): FunnelStage {
  const f = session.funnel ?? {};
  if (session.status === 'opted_out') return 'opted_out';
  if (session.status === 'completed' || f.completed) return 'completed';
  if (['expired', 'revoked', 'abandoned'].includes(session.status)) return 'closed';
  if (f.chat_started) return 'started';
  if (f.link_opened) return 'opened';
  if (f.delivered) return 'delivered';
  if (f.sms_sent) return 'sent';
  return 'issued';
}

/** Due reminders grouped per campaign, for one "send reminders" action each. */
export function groupReminders(due: DueReminder[]) {
  const byCampaign = new Map<string, { campaignId: string; campaignName: string; leadIds: string[] }>();
  for (const item of due) {
    const group = byCampaign.get(item.campaignId) ?? {
      campaignId: item.campaignId,
      campaignName: item.campaignName,
      leadIds: [],
    };
    if (!group.leadIds.includes(item.leadId)) group.leadIds.push(item.leadId);
    byCampaign.set(item.campaignId, group);
  }
  return [...byCampaign.values()];
}
