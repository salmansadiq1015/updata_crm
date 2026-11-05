import apiClient from '@/lib/api/client';
import { readLeadCallLifecycle } from '../schemas/lead-call-lifecycle';
import type {
  AnswerCorrectionInput,
  AnswerHistoryEntry,
  AssignmentPolicy,
  CallTranscript,
  ContactSuppression,
  CreateFollowUpInput,
  FollowUp,
  FollowUpAgentOption,
  FollowUpAiAction,
  FollowUpAutomation,
  FollowUpAutomationSettings,
  FollowUpListParams,
  FollowUpPage,
  FollowUpSummary,
  TimelineEntry,
  TimelineFilters,
  TimelinePage,
  TranscriptRef,
  TranscriptTurn,
} from '../types/lead-workflow-types';
import { FOLLOW_UP_AUTOMATION_STATES } from '../types/lead-workflow-types';

/**
 * Lead workflow API: unified timeline, answer history/corrections, follow-up
 * inbox and assignment policy. Parsing is tolerant: unknown fields are ignored,
 * missing optional ones become null (never a made-up value).
 */

export const LEAD_WORKFLOW_ENDPOINTS = {
  TIMELINE: (leadId: string) => `/crm/leads/${leadId}/timeline`,
  TRANSCRIPT: (leadId: string, callId: string) => `/crm/leads/${leadId}/timeline/calls/${callId}/transcript`,
  HISTORY: (leadId: string) => `/crm/leads/${leadId}/qualification/history`,
  CORRECTIONS: (leadId: string) => `/crm/leads/${leadId}/qualification/corrections`,
  FOLLOW_UPS: '/crm/follow-ups',
  FOLLOW_UP_SUMMARY: '/crm/follow-ups/summary',
  FOLLOW_UP: (id: string) => `/crm/follow-ups/${id}`,
  FOLLOW_UP_ACTION: (id: string, action: 'complete' | 'snooze' | 'reassign' | 'cancel') => `/crm/follow-ups/${id}/${action}`,
  FOLLOW_UP_CONTACT_CHECK: (id: string) => `/crm/follow-ups/${id}/contact-check`,
  POLICY: '/crm/lead-assignment-policy',
  /** AI follow-up calling (server aiCalling/followUpCalling.routes.js). */
  FOLLOW_UP_AI_ACTION: (id: string, action: FollowUpAiAction['action']) => `/ai-calling/follow-ups/${id}/${action}`,
  FOLLOW_UP_AI_SETTINGS: '/ai-calling/settings/follow-up',
  AI_AGENTS: '/ai-calling/agents',
} as const;

type Rec = Record<string, unknown>;
type Envelope = { data?: unknown; pagination?: { hasNext?: boolean; nextCursor?: string | null } | null };

const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const val = (v: unknown) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (isRec(x) ? str(x._id) : str(x))).filter((x): x is string => Boolean(x)) : []);

function parseTurn(raw: unknown, fallbackIndex: number): TranscriptTurn | null {
  if (!isRec(raw) || typeof raw.text !== 'string') return null;
  return {
    index: num(raw.index) ?? fallbackIndex,
    role: raw.role === 'assistant' ? 'assistant' : 'customer',
    text: raw.text,
    at: str(raw.at),
    interrupted: raw.interrupted === true,
  };
}

export function parseTranscriptRef(raw: unknown): TranscriptRef | null {
  if (!isRec(raw)) return null;
  return { callRecordId: str(raw.callRecordId), turnIndex: num(raw.turnIndex), startMs: num(raw.startMs), quote: str(raw.quote) };
}

export function parseTimelineEntry(raw: unknown): TimelineEntry | null {
  if (!isRec(raw) || !str(raw.id) || !str(raw.type) || !str(raw.at)) return null;
  const transcript = isRec(raw.transcript) ? raw.transcript : null;
  const links: Record<string, string | null> = {};
  if (isRec(raw.links)) for (const [k, v] of Object.entries(raw.links)) links[k] = str(v);
  const actor = isRec(raw.actor) && str(raw.actor.id) ? { id: str(raw.actor.id) as string, name: str(raw.actor.name) } : null;
  return {
    id: raw.id as string,
    type: raw.type as TimelineEntry['type'],
    at: raw.at as string,
    leadId: str(raw.leadId),
    mergedFrom: str(raw.mergedFrom),
    channel: (str(raw.channel) as TimelineEntry['channel']) ?? null,
    direction: raw.direction === 'inbound' ? 'inbound' : raw.direction === 'outbound' ? 'outbound' : null,
    title: str(raw.title) ?? '',
    status: str(raw.status),
    summary: str(raw.summary),
    body: str(raw.body),
    actor,
    links,
    transcript: transcript ? {
      available: transcript.available === true,
      expired: transcript.expired === true,
      restricted: transcript.restricted === true,
      turnCount: num(transcript.turnCount) ?? 0,
      excerpt: (Array.isArray(transcript.excerpt) ? transcript.excerpt : []).map(parseTurn).filter((t): t is TranscriptTurn => t !== null),
    } : null,
    meta: isRec(raw.meta) ? raw.meta : {},
  };
}

export function parseHistoryEntry(raw: unknown): AnswerHistoryEntry | null {
  if (!isRec(raw) || !isRec(raw.current)) return null;
  const prev = isRec(raw.previous) ? raw.previous : null;
  return {
    id: str(raw._id) ?? str(raw.id) ?? '',
    fieldKey: str(raw.fieldKey) ?? '',
    previous: prev ? { value: val(prev.value), status: str(prev.status) ?? 'unknown' } : null,
    current: { value: val(raw.current.value), status: str(raw.current.status) ?? 'unknown', evidence: str(raw.current.evidence) },
    source: (str(raw.source) as AnswerHistoryEntry['source']) ?? null,
    changedAt: str(raw.changedAt),
    changedByName: str(raw.changedByName),
    communicationId: str(raw.communicationId),
    callRecordId: str(raw.callRecordId),
    smsMessageId: str(raw.smsMessageId),
    transcriptRef: parseTranscriptRef(raw.transcriptRef),
    correctionOf: str(raw.correctionOf),
    reason: str(raw.reason),
  };
}

function parseSuppression(raw: unknown): ContactSuppression | null {
  if (!isRec(raw)) return null;
  return {
    suppressed: raw.suppressed === true,
    reason: str(raw.reason),
    reasons: strings(raw.reasons),
    nextAllowedAt: str(raw.nextAllowedAt),
    limited: raw.limited === true,
  };
}

const AUTOMATION_STATES = new Set<string>(FOLLOW_UP_AUTOMATION_STATES);

export function parseAutomation(raw: unknown): FollowUpAutomation | null {
  if (!isRec(raw)) return null;
  const tr = isRec(raw.timeResolution) && str(raw.timeResolution.kind) ? raw.timeResolution : null;
  const call = isRec(raw.call) ? raw.call : null;
  const agent = isRec(raw.agent) && str(raw.agent.id) ? raw.agent : null;
  const state = str(raw.state);
  return {
    mode: raw.mode === 'ai' ? 'ai' : 'human',
    agentId: str(raw.agentId),
    state: state && AUTOMATION_STATES.has(state) ? state as FollowUpAutomation['state'] : null,
    reason: str(raw.reason),
    outcome: str(raw.outcome),
    round: num(raw.round) ?? 1,
    attempts: num(raw.attempts) ?? 0,
    campaignId: str(raw.campaignId),
    callRecordId: str(raw.callRecordId),
    previousCallId: str(raw.previousCallId),
    notBefore: str(raw.notBefore),
    lastError: str(raw.lastError),
    instructions: str(raw.instructions),
    timeResolution: tr ? { kind: str(tr.kind) as string, approximate: tr.approximate === true, requestedText: str(tr.requestedText), shiftedFrom: str(tr.shiftedFrom) } : null,
    stateChangedAt: str(raw.stateChangedAt),
    history: (Array.isArray(raw.history) ? raw.history : []).filter(isRec).filter((h) => str(h.state))
      .map((h) => ({ state: h.state as string, at: str(h.at), reason: str(h.reason) })),
    call: call ? {
      state: str(call.state), disposition: str(call.disposition), qualification: str(call.qualification),
      durationSeconds: num(call.durationSeconds) ?? 0, answeredAt: str(call.answeredAt), endedAt: str(call.endedAt), summary: str(call.summary),
    } : null,
    agent: agent ? {
      id: agent.id as string, name: str(agent.name) ?? '', title: str(agent.title), agentType: str(agent.agentType),
      avatarPresetId: str(agent.avatarPresetId), availability: str(agent.availability),
    } : null,
  };
}

export function parseAgentOption(raw: unknown): FollowUpAgentOption | null {
  if (!isRec(raw)) return null;
  const id = str(raw._id) ?? str(raw.id);
  if (!id) return null;
  const fu = isRec(raw.followUp) ? raw.followUp : {};
  return {
    id,
    name: str(raw.name) ?? '',
    title: str(raw.title),
    agentType: str(raw.agentType),
    availability: str(raw.availability),
    avatarUrl: str(raw.avatarUrl),
    followUp: { enabled: fu.enabled === true, autoCall: fu.autoCall === true, manualCall: fu.manualCall !== false },
  };
}

export function parseAutomationSettings(raw: unknown): FollowUpAutomationSettings {
  const d = isRec(raw) ? raw : {};
  return { enabled: d.enabled === true, forcedOffByEnv: d.forcedOffByEnv === true, pausedReason: str(d.pausedReason), voicePaused: d.voicePaused === true };
}

export function parseFollowUp(raw: unknown): FollowUp | null {
  if (!isRec(raw) || !str(raw.id)) return null;
  const lead = isRec(raw.lead) ? raw.lead : {};
  const owner = isRec(raw.owner) ? raw.owner : {};
  const source = isRec(raw.source) ? raw.source : {};
  const status = (['open', 'snoozed', 'done', 'cancelled'] as const).find((s) => s === raw.status) ?? 'open';
  const bucket = (['overdue', 'today', 'upcoming', 'done'] as const).find((b) => b === raw.bucket) ?? 'upcoming';
  return {
    id: raw.id as string,
    leadId: str(raw.leadId) ?? '',
    lead: { id: str(lead.id) ?? str(raw.leadId) ?? '', name: str(lead.name) ?? '', leadNumber: str(lead.leadNumber), status: str(lead.status),
      email: str(lead.email), phone: str(lead.phone), pipelineStage: str(lead.pipelineStage) ?? 'LEAD',
      lastContactedAt: str(lead.lastContactedAt), lastContactChannel: str(lead.lastContactChannel),
      latestCall: readLeadCallLifecycle(lead.latestCall) },
    owner: { id: str(owner.id) ?? '', name: str(owner.name) },
    createdBy: str(raw.createdBy),
    dueAt: str(raw.dueAt),
    nextDueAt: str(raw.nextDueAt),
    timezone: str(raw.timezone),
    channel: str(raw.channel),
    note: str(raw.note),
    status,
    bucket,
    taskType: str(raw.taskType), priority: str(raw.priority) ?? 'NORMAL', reminderMinutes: num(raw.reminderMinutes),
    snoozedUntil: str(raw.snoozedUntil),
    snoozeCount: num(raw.snoozeCount) ?? 0,
    completedAt: str(raw.completedAt),
    completionNote: str(raw.completionNote),
    cancelledAt: str(raw.cancelledAt),
    cancelReason: str(raw.cancelReason),
    source: {
      type: str(source.type) ?? 'manual',
      communicationId: str(source.communicationId),
      callRecordId: str(source.callRecordId),
      campaignId: str(source.campaignId),
      callingAgentId: str(source.callingAgentId),
      qualification: str(source.qualification),
      recommendedAction: str(source.recommendedAction),
      contactLogId: str(source.contactLogId),
      requestedTimeText: str(source.requestedTimeText),
    },
    suppression: parseSuppression(raw.suppression),
    automation: parseAutomation(raw.automation),
    createdAt: str(raw.createdAt),
  };
}

export function parsePolicy(raw: unknown): AssignmentPolicy {
  const p = isRec(raw) ? raw : {};
  const sla = isRec(p.sla) ? p.sla : {};
  const bh = isRec(sla.businessHours) ? sla.businessHours : {};
  const esc = isRec(p.escalation) ? p.escalation : {};
  return {
    enabled: p.enabled === true,
    strategy: p.strategy === 'least_loaded' ? 'least_loaded' : 'round_robin',
    eligibleUserIds: strings(p.eligibleUserIds),
    rules: (Array.isArray(p.rules) ? p.rules : []).filter(isRec).map((r) => {
      const m = isRec(r.match) ? r.match : {};
      return {
        _id: str(r._id),
        name: str(r.name),
        match: { source: str(m.source), city: str(m.city), businessType: str(m.businessType) },
        userIds: strings(r.userIds),
        strategy: r.strategy === 'least_loaded' || r.strategy === 'round_robin' ? r.strategy : null,
      };
    }),
    sla: {
      enabled: sla.enabled === true,
      firstResponseMinutes: num(sla.firstResponseMinutes) ?? 240,
      businessHours: {
        enabled: bh.enabled === true,
        timezone: str(bh.timezone) ?? 'Europe/Zurich',
        days: Array.isArray(bh.days) ? bh.days.filter((d): d is number => typeof d === 'number') : [1, 2, 3, 4, 5],
        start: str(bh.start) ?? '08:00',
        end: str(bh.end) ?? '17:00',
      },
    },
    escalation: {
      enabled: esc.enabled === true,
      afterMinutes: num(esc.afterMinutes) ?? 60,
      maxLevel: num(esc.maxLevel) ?? 2,
      userIds: strings(esc.userIds),
      followUpAfterMinutes: num(esc.followUpAfterMinutes) ?? 1440,
    },
  };
}

const page = <T>(response: Envelope, parse: (raw: unknown) => T | null) => ({
  data: (Array.isArray(response.data) ? response.data : []).map(parse).filter((x): x is T => x !== null),
  pagination: { hasNext: Boolean(response.pagination?.hasNext), nextCursor: response.pagination?.nextCursor ?? null },
});

export const leadWorkflowApi = {
  async timeline(leadId: string, cursor: string | null, filters: TimelineFilters = {}, limit = 25): Promise<TimelinePage> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    if (filters.types?.length) params.types = filters.types.join(',');
    if (filters.channel) params.channel = filters.channel;
    return page((await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.TIMELINE(leadId), { params })) as Envelope, parseTimelineEntry);
  },

  async transcript(leadId: string, callId: string): Promise<CallTranscript> {
    const response = (await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.TRANSCRIPT(leadId, callId))) as Envelope;
    const d = isRec(response.data) ? response.data : {};
    return {
      callRecordId: str(d.callRecordId) ?? callId,
      campaignName: str(d.campaignName),
      agentName: str(d.agentName),
      disposition: str(d.disposition),
      startedAt: str(d.startedAt),
      expired: d.expired === true,
      turns: (Array.isArray(d.turns) ? d.turns : []).map(parseTurn).filter((t): t is TranscriptTurn => t !== null),
    };
  },

  async fieldHistory(leadId: string, fieldKey: string): Promise<AnswerHistoryEntry[]> {
    const response = (await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.HISTORY(leadId), { params: { fieldKey, limit: 50 } })) as Envelope;
    return (Array.isArray(response.data) ? response.data : []).map(parseHistoryEntry).filter((e): e is AnswerHistoryEntry => e !== null);
  },

  async correct(leadId: string, input: AnswerCorrectionInput): Promise<AnswerHistoryEntry | null> {
    const response = (await apiClient.post(LEAD_WORKFLOW_ENDPOINTS.CORRECTIONS(leadId), input)) as Envelope;
    return parseHistoryEntry(response.data);
  },

  async followUps(params: FollowUpListParams, cursor: string | null, limit = 25): Promise<FollowUpPage> {
    const query: Record<string, string | number> = { scope: params.scope, bucket: params.bucket, tz: params.tz, limit };
    if (params.leadId) query.leadId = params.leadId;
    if (params.q) query.q = params.q;
    if (params.channel) query.channel = params.channel;
    if (params.ownerId) query.ownerId = params.ownerId;
    if (params.qualification) query.qualification = params.qualification;
    if (params.order) query.order = params.order;
    if (params.management) query.management = params.management;
    if (params.agentId) query.agentId = params.agentId;
    if (cursor) query.cursor = cursor;
    return page((await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.FOLLOW_UPS, { params: query })) as Envelope, parseFollowUp);
  },

  async followUpSummary(scope: string, tz: string): Promise<FollowUpSummary> {
    const response = (await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.FOLLOW_UP_SUMMARY, { params: { scope, tz } })) as Envelope;
    const d = isRec(response.data) ? response.data : {};
    return { overdue: num(d.overdue) ?? 0, today: num(d.today) ?? 0, upcoming: num(d.upcoming) ?? 0, done: num(d.done) ?? 0, timezone: str(d.timezone) ?? tz,
      totalLeads: num(d.totalLeads) ?? 0, qualifiedLeads: num(d.qualifiedLeads) ?? 0, pending: num(d.pending) ?? 0, completed: num(d.completed) ?? 0,
      emailsSent: num(d.emailsSent) ?? 0, emailsDelivered: num(d.emailsDelivered) ?? 0, emailsFailed: num(d.emailsFailed) ?? 0,
      aiManaged: num(d.aiManaged) ?? 0, aiScheduled: num(d.aiScheduled) ?? 0, aiInProgress: num(d.aiInProgress) ?? 0,
      aiCompleted: num(d.aiCompleted) ?? 0, aiFailed: num(d.aiFailed) ?? 0, attention: num(d.attention) ?? 0 };
  },

  async followUp(id: string): Promise<FollowUp | null> {
    return parseFollowUp(((await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.FOLLOW_UP(id))) as Envelope).data);
  },

  /** AI follow-up controls; every action returns the updated follow-up row. Errors (400/409) carry the server message. */
  async followUpAiAction({ id, action, body }: FollowUpAiAction): Promise<FollowUp | null> {
    return parseFollowUp(((await apiClient.post(LEAD_WORKFLOW_ENDPOINTS.FOLLOW_UP_AI_ACTION(id, action), body ?? {})) as Envelope).data);
  },

  async followUpAutomationSettings(): Promise<FollowUpAutomationSettings> {
    return parseAutomationSettings(((await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.FOLLOW_UP_AI_SETTINGS)) as Envelope).data);
  },

  /** The viewer's outbound AI agents (all pages, sorted by name). */
  async followUpAgents(): Promise<FollowUpAgentOption[]> {
    const out: FollowUpAgentOption[] = [];
    for (let pageNo = 1; pageNo <= 10; pageNo += 1) {
      const response = (await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.AI_AGENTS, { params: { usage: 'outbound', page: pageNo, limit: 100, sort: 'name' } })) as {
        data?: unknown; pagination?: { pages?: number } | null;
      };
      const agents = isRec(response.data) && Array.isArray(response.data.agents) ? response.data.agents : null;
      if (!agents) throw new Error('The AI agent list could not be read. Refresh and try again.');
      out.push(...agents.map(parseAgentOption).filter((a): a is FollowUpAgentOption => a !== null));
      if (!(num(response.pagination?.pages) && (response.pagination?.pages as number) > pageNo)) break;
    }
    return [...new Map(out.map((a) => [a.id, a])).values()].filter((a) => a.availability !== 'archived');
  },

  async createFollowUp(input: CreateFollowUpInput): Promise<FollowUp | null> {
    return parseFollowUp(((await apiClient.post(LEAD_WORKFLOW_ENDPOINTS.FOLLOW_UPS, input)) as Envelope).data);
  },

  async followUpAction(id: string, action: 'complete' | 'snooze' | 'reassign' | 'cancel', body: Record<string, unknown>): Promise<FollowUp | null> {
    return parseFollowUp(((await apiClient.post(LEAD_WORKFLOW_ENDPOINTS.FOLLOW_UP_ACTION(id, action), body)) as Envelope).data);
  },

  /** Action-time suppression re-check; rejects (409 CONTACT_SUPPRESSED) when blocked. */
  async contactCheck(id: string, channel?: string | null): Promise<ContactSuppression | null> {
    const response = (await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.FOLLOW_UP_CONTACT_CHECK(id), { params: channel ? { channel } : {} })) as Envelope;
    return parseSuppression(response.data);
  },

  async policy(): Promise<AssignmentPolicy> {
    return parsePolicy(((await apiClient.get(LEAD_WORKFLOW_ENDPOINTS.POLICY)) as Envelope).data);
  },

  async savePolicy(input: Partial<AssignmentPolicy>): Promise<AssignmentPolicy> {
    return parsePolicy(((await apiClient.put(LEAD_WORKFLOW_ENDPOINTS.POLICY, input)) as Envelope).data);
  },
};
