// Pure rules for the AI agent flow (unit-tested; no React, no I/O).
import { analyzeSms } from '@/features/communication/domain/smsEncoding';
import { ApiError } from '@/services/api/apiErrors';

import type {
  AgentChannel,
  AgentLanguage,
  AgentQuestion,
  CallCampaignInput,
  MessagingHealth,
  SmsRecipient,
  StatusRuleInput,
  TelephonyHealth,
} from '../types';

// ---------------------------------------------------------------- languages
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Case- and accent-insensitive match on code, English name and native name. */
export function filterLanguages(languages: readonly AgentLanguage[], query: string): AgentLanguage[] {
  const q = fold(query.trim());
  if (!q) return [...languages];
  return languages.filter((language) =>
    [language.code, language.name, language.nativeName].some((value) => fold(value).includes(q)),
  );
}

// ---------------------------------------------------------------- readiness
export type Readiness =
  | { state: 'ready' }
  | { state: 'not_ready'; reason: string | null }
  | { state: 'unknown'; forbidden: boolean }
  | { state: 'checking' };

type QueryLike<T> = { data?: T; isPending: boolean; isError: boolean; error: unknown };

const unknownFrom = (error: unknown): Readiness => ({
  state: 'unknown',
  forbidden: error instanceof ApiError && error.status === 403,
});

/** AI calls can dial only when the server reports a configured PSTN trunk. */
export function callReadiness(query: QueryLike<TelephonyHealth>): Readiness {
  if (query.isError) return unknownFrom(query.error);
  if (query.isPending || !query.data) return { state: 'checking' };
  return query.data.configured ? { state: 'ready' } : { state: 'not_ready', reason: query.data.reason };
}

/** SMS is ready when at least one enabled SMS provider passes its live health check. */
export function smsReadiness(query: QueryLike<MessagingHealth>): Readiness {
  if (query.isError) return unknownFrom(query.error);
  if (query.isPending || !query.data) return { state: 'checking' };
  const { settings, providers } = query.data;
  const textbee = settings.providers.textbeeEnabled && providers.textbee.eligible;
  const twilio = settings.providers.twilioEnabled && providers.twilio.eligible;
  if (textbee || twilio) return { state: 'ready' };
  const enabled = settings.providers.textbeeEnabled || settings.providers.twilioEnabled;
  return {
    state: 'not_ready',
    reason: enabled
      ? (providers.textbee.reason ?? providers.twilio.reason ?? 'provider_unhealthy')
      : 'no_sms_provider',
  };
}

/**
 * Whether Start may be offered. Calls need a confirmed-ready trunk: "unknown" keeps
 * Start disabled (we must not imply a call could be placed). SMS with unknown
 * status may start (the server still refuses ineligible work and records
 * provider outcomes honestly), but never when the server says it is not ready.
 */
export function canStart(channel: AgentChannel, readiness: Readiness, eligibleCount: number): boolean {
  if (eligibleCount <= 0) return false;
  if (channel === 'call') return readiness.state === 'ready';
  return readiness.state === 'ready' || readiness.state === 'unknown';
}

// ---------------------------------------------------------------- campaign actions
export type CampaignAction = 'pause' | 'resume' | 'cancel';

/** Mirrors the server's own guards (aiCalling/messaging service pause/start/cancel). */
export function availableActions(status: string): CampaignAction[] {
  const actions: CampaignAction[] = [];
  if (['running', 'scheduled', 'queued'].includes(status)) actions.push('pause');
  if (status === 'paused') actions.push('resume');
  if (!['completed', 'cancelled'].includes(status)) actions.push('cancel');
  return actions;
}

// ---------------------------------------------------------------- SMS estimate
export type SegmentEstimate = {
  /** Sum of segments over the recipients we have rendered text for. */
  segments: number;
  /** Recipients the estimate covers (server-rendered texts fetched). */
  sampled: number;
  /** True when the estimate covers every eligible recipient. */
  exact: boolean;
};

/**
 * Estimate from the server-rendered per-recipient text. When only a page of
 * recipients is loaded, the average is extrapolated and `exact` is false.
 */
export function estimateSegments(
  recipients: readonly SmsRecipient[],
  eligibleTotal: number,
): SegmentEstimate {
  const eligible = recipients.filter((recipient) => recipient.eligibility.eligible);
  const sampledSegments = eligible.reduce(
    (sum, recipient) => sum + analyzeSms(recipient.rendered.bodyText ?? '').segments,
    0,
  );
  if (eligible.length === 0) return { segments: 0, sampled: 0, exact: eligibleTotal === 0 };
  if (eligible.length >= eligibleTotal)
    return { segments: sampledSegments, sampled: eligible.length, exact: true };
  const average = sampledSegments / eligible.length;
  return { segments: Math.ceil(average * eligibleTotal), sampled: eligible.length, exact: false };
}

/** Ineligible reasons grouped for display ("missing_phone" × 3). Parametrised reasons collapse to their prefix. */
export function reasonCounts(rows: readonly { eligibility: { eligible: boolean; reasons: string[] } }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.eligibility.eligible) continue;
    for (const reason of row.eligibility.reasons) {
      const key = reason.split(':')[0] ?? reason;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// ---------------------------------------------------------------- call defaults
export type DefaultQuestionTexts = Record<
  'decision_authority' | 'need' | 'interest' | 'timeline' | 'callback_time',
  { label: string; text: string }
>;

/**
 * No server-side default questionnaire exists, so the app proposes one built from
 * the CRM's qualification fields (server crm/leadQualification.constants.js), so
 * answers line up with the lead's qualification record. Texts come localized.
 */
export function defaultQuestions(texts: DefaultQuestionTexts): AgentQuestion[] {
  return [
    {
      fieldKey: 'decision_authority',
      ...texts.decision_authority,
      type: 'single_choice',
      required: true,
      options: ['decision_maker', 'influencer', 'no_authority'],
      mapTo: 'qualification.decision_authority',
    },
    {
      fieldKey: 'need',
      ...texts.need,
      type: 'long_text',
      required: true,
      options: [],
      mapTo: 'qualification.need',
    },
    {
      fieldKey: 'interest',
      ...texts.interest,
      type: 'single_choice',
      required: true,
      options: ['high', 'medium', 'low', 'none'],
      mapTo: 'qualification.interest',
    },
    {
      fieldKey: 'timeline',
      ...texts.timeline,
      type: 'single_choice',
      required: false,
      options: ['immediate', 'within_3_months', 'within_6_months', 'later'],
      mapTo: 'qualification.timeline',
    },
    {
      fieldKey: 'callback_time',
      ...texts.callback_time,
      type: 'short_text',
      required: false,
      options: [],
      mapTo: 'qualification.callback_time',
    },
  ];
}

/**
 * Conservative default rules: "qualified" always goes to human review before the
 * lead status changes; a clear "no interest" marks it not interested. Rules whose
 * fields were removed from the questionnaire are dropped.
 */
export function defaultStatusRules(questions: readonly AgentQuestion[]): StatusRuleInput[] {
  const keys = new Set(questions.map((question) => question.fieldKey));
  const rules: (StatusRuleInput & { fields: string[] })[] = [
    {
      id: 'qualified_needs_review',
      fields: ['decision_authority', 'interest'],
      when: {
        all: [
          { field: 'decision_authority', equals: 'decision_maker' },
          { field: 'interest', in: ['high', 'medium'] },
        ],
      },
      action: 'mark_qualified',
      requiresReview: true,
    },
    {
      id: 'not_interested',
      fields: ['interest'],
      when: { all: [{ field: 'interest', equals: 'none' }] },
      action: 'mark_not_interested',
      requiresReview: false,
    },
  ];
  return rules
    .filter((rule) => rule.fields.every((field) => keys.has(field)))
    .map(({ fields: _fields, ...rule }) => rule);
}

const CHOICE_TYPES = new Set(['single_choice']);

/** Server-shaped questionnaire (order + {value,label} options). */
export function toQuestionnaire(questions: readonly AgentQuestion[]): CallCampaignInput['questionnaire'] {
  return {
    questions: questions.map((question, index) => ({
      ...question,
      order: index + 1,
      options: CHOICE_TYPES.has(question.type)
        ? question.options.map((value) => ({ value, label: value }))
        : [],
    })),
  };
}

/** A question is complete when it has a label and text, and choice questions have options. */
export function questionErrors(questions: readonly AgentQuestion[]): number[] {
  return questions
    .map((question, index) =>
      !question.label.trim() ||
      !question.text.trim() ||
      (CHOICE_TYPES.has(question.type) && question.options.length === 0)
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidTime = (value: string) => TIME.test(value);

export function isValidTimezone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
