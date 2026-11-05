// Incoming Calls (server/src/modules/inboundCalling). The AI answers calls that ring on the
// user's own phone through the paired-phone Bluetooth bridge (ESP32 + laptop gateway); caller
// ID comes from that bridge. This app never answers a call or reads the call log itself: it is
// the control and monitoring surface over the same backend records as the website.
//
// Schemas are deliberately tolerant (loose objects, null-safe fields, array fallbacks) so a new
// or missing server field never blanks a screen.
import { z } from 'zod';

const str = z
  .string()
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);
const num = z
  .number()
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);
const bool = z.boolean().catch(false);
const strList = z.array(z.string()).catch([]);
/** Field values are stored as strings, but numbers are accepted by the agent API. */
const text = z
  .union([z.string(), z.number()])
  .nullish()
  .catch(null)
  .transform((v) => (v == null ? '' : String(v)));

export const CALL_FILTERS = ['all', 'open', 'mine', 'ai', 'missed', 'newLeads'] as const;
export type CallFilter = (typeof CALL_FILTERS)[number];

/** Where the follow-up work on a call stands (server engine/workStatus.js), not the call state. */
export const WORK_STATUSES = [
  'new',
  'in_progress',
  'follow_up',
  'waiting_on_caller',
  'resolved',
  'closed',
  'spam',
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/** Lead to use for a follow-up when the call has none yet: a matching lead or a new one. */
export type LeadChoice = { leadId: string } | { createLead: true };

export const CONTROL_KINDS = ['answer', 'reject', 'takeover', 'hangup'] as const;
export type ControlKind = (typeof CONTROL_KINDS)[number];

export const turnSchema = z.looseObject({
  itemId: str,
  role: z.string().catch('system'),
  text: z.string().catch(''),
  interrupted: bool,
  at: str,
});
export type TranscriptTurn = z.infer<typeof turnSchema>;

const refSchema = z.looseObject({ id: z.string(), name: str });

/** One row of GET /inbound-calls (inboundQuery.service.js presentRow). */
export const inboundCallRowSchema = z.looseObject({
  id: z.string(),
  callId: str,
  caller: z
    .looseObject({ name: str, number: str, presentation: z.string().catch('available') })
    .catch({ name: null, number: null, presentation: 'available' }),
  /** new | existing | ambiguous | unknown | private (withheld number). */
  callerType: str,
  lead: z
    .looseObject({ id: z.string(), name: str, number: str, created: bool })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  status: z.string(),
  aiStatus: z.string().catch('not_applicable'),
  audioStatus: z.string().catch('none'),
  handling: str,
  answeredBy: str,
  outcome: str,
  agent: refSchema
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  rule: str,
  /** Why the AI did not take the call, e.g. `call_waiting` (rang during another call). */
  aiBlockedBy: str,
  /** Not in presentRow today; accepted if the server starts sending it. */
  callWaiting: z.boolean().optional().catch(undefined),
  sim: z.looseObject({ slot: num, label: str }).catch({ slot: null, label: null }),
  device: refSchema
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  durationSeconds: z.number().catch(0),
  ringSeconds: num,
  primaryInquiry: str,
  workStatus: str,
  /** user | agent | system: who set the work status last. */
  workSource: str,
  workUpdatedAt: str,
  /** User id the call is assigned to (assignees see calls assigned to them). */
  assignedTo: str,
  qualification: str,
  callbackRequested: bool,
  humanRequested: bool,
  detectedAt: str,
  answeredAt: str,
  endedAt: str,
});
export type InboundCallRow = z.infer<typeof inboundCallRowSchema>;

const handoffSchema = z
  .looseObject({ requested: bool, status: str, reason: str, summary: str, requestedAt: str })
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

/** GET /inbound-calls/live: active calls with the agent's activity and a transcript tail. */
export const liveInboundCallSchema = inboundCallRowSchema.extend({
  agentActivity: z
    .looseObject({ state: str, speaker: str, at: str })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  pendingCommand: str,
  language: str,
  handoff: handoffSchema,
  lastTurns: z.array(turnSchema).catch([]),
  collected: z
    .array(z.looseObject({ key: z.string(), value: text, explicit: z.boolean().catch(true) }))
    .catch([]),
  questionCount: z.number().catch(0),
});
export type LiveInboundCall = z.infer<typeof liveInboundCallSchema>;
export const liveInboundCallListSchema = z.array(liveInboundCallSchema);

export const extractedFieldSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  label: z.string().catch(''),
  value: text,
  explicit: z.boolean().catch(true),
  confidence: num,
  verification: z.string().catch('unverified'),
  evidence: str,
  superseded: bool,
  appliedToLead: bool,
  source: str,
  at: str,
});
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

export const callerQuestionSchema = z.looseObject({
  id: z.string(),
  text: z.string().catch(''),
  category: z.string().catch('OTHER'),
  categorySource: str,
  answerStatus: z.string().catch('unanswered'),
  answerSummary: str,
  at: str,
});
export type CallerQuestion = z.infer<typeof callerQuestionSchema>;

/** Questions the agent asks before saying goodbye (configured per agent), with the outcome. */
export const CLOSING_STATUSES = ['answered', 'declined', 'not_asked'] as const;
export const closingQuestionSchema = z.looseObject({
  key: z.string(),
  label: str,
  question: str,
  type: str,
  required: bool,
  status: z.enum(CLOSING_STATUSES).catch('not_asked'),
  value: z
    .union([z.string(), z.number(), z.boolean()])
    .nullish()
    .catch(null)
    .transform((v) => (v == null ? null : String(v))),
  explicit: z
    .boolean()
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
});
export type ClosingQuestion = z.infer<typeof closingQuestionSchema>;

export const recommendationSchema = z.looseObject({
  id: z.string(),
  action: z.string(),
  reason: z.string().catch(''),
  status: z.string().catch('pending'),
  followUpId: str,
  automatic: bool,
  decidedAt: str,
});
export type Recommendation = z.infer<typeof recommendationSchema>;

const personRef = z
  .looseObject({ id: z.string(), name: str })
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

export const workHistorySchema = z.looseObject({
  from: str,
  to: str,
  source: str,
  reason: str,
  note: str,
  at: str,
  by: personRef,
  assignedTo: personRef,
  assignedFrom: personRef,
});
export type WorkHistoryEntry = z.infer<typeof workHistorySchema>;

/** GET /inbound-calls/:id (inboundQuery.service.js get). */
export const inboundCallDetailSchema = inboundCallRowSchema.extend({
  leadDetail: z
    .looseObject({
      id: z.string(),
      name: str,
      number: str,
      status: str,
      email: str,
      phone: str,
      source: str,
      city: str,
    })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  match: z
    .looseObject({
      status: str,
      candidates: z.array(z.looseObject({ id: z.string(), name: str, number: str })).catch([]),
    })
    .catch({ status: null, candidates: [] }),
  language: z
    .looseObject({ initial: str, current: str })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  transcript: z.array(turnSchema).catch([]),
  fields: z.array(extractedFieldSchema).catch([]),
  qa: z
    .looseObject({
      callerQuestions: z.array(callerQuestionSchema).catch([]),
      unanswered: strList,
      missingInformation: strList,
      closingQuestions: z.array(closingQuestionSchema).catch([]),
    })
    .catch({ callerQuestions: [], unanswered: [], missingInformation: [], closingQuestions: [] }),
  intentsDetail: z
    .looseObject({ primary: str, secondary: strList, source: str })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  summary: z
    .looseObject({
      reason: str,
      text: str,
      requirements: strList,
      concerns: strList,
      objections: strList,
      unresolvedQuestions: strList,
      tone: str,
      notInterested: bool,
      generatedBy: str,
    })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  qualificationDetail: z
    .looseObject({ result: str, reasons: strList, met: strList, missing: strList, score: num })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  recommendations: z.array(recommendationSchema).catch([]),
  followUpIds: strList,
  callback: z
    .looseObject({ requested: bool, whenText: str, note: str })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  handoff: handoffSchema,
  doNotContact: bool,
  notes: z
    .array(z.looseObject({ id: z.string(), text: z.string().catch(''), by: str, byName: str, at: str }))
    .catch([]),
  work: z
    .looseObject({
      status: str,
      reason: str,
      source: str,
      updatedAt: str,
      updatedBy: personRef,
      assignee: personRef,
      history: z.array(workHistorySchema).catch([]),
    })
    .catch({
      status: null,
      reason: null,
      source: null,
      updatedAt: null,
      updatedBy: null,
      assignee: null,
      history: [],
    }),
  /** Priced AI cost of the call (aiCalling pricedCost). */
  cost: z
    .looseObject({
      amount: z.number().catch(0),
      currency: z.string().catch('USD'),
      source: str,
      estimate: bool,
      unpriced: bool,
      model: str,
      tokens: z
        .looseObject({ total: num })
        .nullish()
        .catch(null)
        .transform((v) => v ?? null),
    })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  pendingCommand: str,
  endReason: str,
  processedAt: str,
  error: z
    .looseObject({ code: str, message: str })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
});
export type InboundCallDetail = z.infer<typeof inboundCallDetailSchema>;

/** GET /inbound-calls/stats — every figure is counted from stored calls. */
export const inboundStatsSchema = z.looseObject({
  total: z.number().catch(0),
  answeredByAi: z.number().catch(0),
  answeredByHuman: z.number().catch(0),
  missed: z.number().catch(0),
  active: z.number().catch(0),
  newLeads: z.number().catch(0),
});
export type InboundStats = z.infer<typeof inboundStatsSchema>;

/** GET/PATCH /inbound-calls/settings (the owner's InboundSettings document). */
export const inboundSettingsSchema = z.looseObject({
  enabled: bool,
  version: z.number(),
  defaultAgentId: str,
});
export type InboundSettings = z.infer<typeof inboundSettingsSchema>;

/** One SIM card as stored on the paired device (PUT /inbound-calls/devices/:id/sims). */
export const reportedSimSchema = z.looseObject({
  slot: z.number(),
  label: z.string().catch(''),
  carrier: z.string().catch(''),
});
export type ReportedSim = { slot: number; label: string; carrier: string };

/** GET /inbound-calls/devices: phones with their incoming-call readiness. */
export const inboundDeviceSchema = z.looseObject({
  id: z.string(),
  name: z.string().catch(''),
  phoneLabel: str,
  online: bool,
  lastHeartbeatAt: str,
  bluetooth: z.string().catch('disconnected'),
  boardConnected: bool,
  signal: num,
  battery: num,
  inCall: bool,
  audioVerified: bool,
  agent: z
    .looseObject({ id: z.string(), name: str, availability: str })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  /** SIM cards the app on that phone reported (HFP cannot tell); empty until reported. */
  sims: z.array(reportedSimSchema).catch([]),
  simsReportedAt: str,
  aiAnswering: z.looseObject({ ready: bool, reasons: strList }).catch({ ready: false, reasons: [] }),
  last24h: z
    .looseObject({ calls: z.number().catch(0), answeredByAi: z.number().catch(0) })
    .catch({ calls: 0, answeredByAi: 0 }),
});
export type InboundDevice = z.infer<typeof inboundDeviceSchema>;
export const inboundDeviceListSchema = z.array(inboundDeviceSchema);

export const paginationSchema = z.looseObject({ page: z.number(), pages: z.number(), total: z.number() });

export const controlResultSchema = z.looseObject({
  ok: z.boolean().optional(),
  duplicate: z.boolean().optional(),
});
export const reportSimsResultSchema = z.looseObject({ sims: z.array(reportedSimSchema).catch([]) });
export const followUpResultSchema = z.looseObject({
  followUpId: z.string(),
  /** Newer servers return the updated call too (lead linked/created, work status). */
  call: z.unknown().optional(),
});
