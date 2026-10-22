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

export type TimelineStepKey = 'sent' | 'delivered' | 'opened' | 'started' | 'completed' | 'opted_out' | 'closed';
export type TimelineStep = { key: TimelineStepKey; at: string | null; reached: boolean };

const TIMELINE_FIELDS: [TimelineStepKey, string][] = [
  ['sent', 'sms_sent'],
  ['delivered', 'delivered'],
  ['opened', 'link_opened'],
  ['started', 'chat_started'],
];

/**
 * The latest session as a short timeline: SMS sent → Delivered → Opened → Chat started → an end
 * step (Completed, Opted out or Closed). A step is reached only when the CRM recorded its
 * timestamp — "delivered" is never inferred from "sent" (carrier reports are often missing).
 */
export function funnelTimeline(session: Pick<LinkSession, 'status' | 'funnel'>): TimelineStep[] {
  const f = (session.funnel ?? {}) as Record<string, string | null | undefined>;
  const steps: TimelineStep[] = TIMELINE_FIELDS.map(([key, field]) => ({
    key,
    at: f[field] ?? null,
    reached: Boolean(f[field]),
  }));
  if (session.status === 'opted_out' || f.opted_out) {
    steps.push({ key: 'opted_out', at: f.opted_out ?? null, reached: true });
  } else if (session.status === 'completed' || f.completed) {
    steps.push({ key: 'completed', at: f.completed ?? null, reached: true });
  } else if (['expired', 'revoked', 'abandoned'].includes(session.status)) {
    steps.push({ key: 'closed', at: f.expired ?? f.abandoned ?? null, reached: true });
  } else {
    steps.push({ key: 'completed', at: null, reached: false });
  }
  return steps;
}
