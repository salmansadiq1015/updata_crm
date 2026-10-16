// Pure rules for the agent settings form and for turning saved defaults into a
// campaign draft (unit-tested; no React, no I/O).
import {
  defaultStatusRules,
  isValidTime,
  isValidTimezone,
  questionErrors,
  toQuestionnaire,
} from '@/features/aiAgent/domain/agentDomain';
import type { AgentQuestion, CallCampaignInput, MessagePurpose } from '@/features/aiAgent/types';

import {
  AGENT_VOICES,
  SCHEDULE_LIMITS,
  type AgentDefaultsInput,
  type AgentVoice,
  type SavedAgentDefaults,
  type ScheduleLimitKey,
} from '../types';

/** The agent name the app proposes when none is saved (same as the web wizard). */
export const STANDARD_AGENT_NAME = 'Alex';
export const STANDARD_WINDOW = { start: '09:00', end: '18:00' } as const;
export const STANDARD_DAYS: readonly number[] = [1, 2, 3, 4, 5];
export const STANDARD_RETRY = { maxAttemptsPerLead: 2, retryDelayMinutes: 120, maxCallsPerDay: 200 } as const;

/** Values the app supplies when nothing is saved (localized / device-dependent ones come from the caller). */
export type SettingsFallbacks = {
  disclosure: string;
  questions: AgentQuestion[];
  timezone: string;
  language: string;
};

export type AgentSettingsForm = {
  agentName: string;
  organizationName: string;
  objective: string;
  language: string;
  voice: AgentVoice;
  disclosure: string;
  questions: AgentQuestion[];
  windowStart: string;
  windowEnd: string;
  daysOfWeek: number[];
  timezone: string;
  /** Numeric fields stay text while editing so the user can clear and retype them. */
  maxAttemptsPerLead: string;
  retryDelayMinutes: string;
  maxCallsPerDay: string;
  smsPurpose: MessagePurpose;
  smsTemplateId: string | null;
};

export const isAgentVoice = (value: unknown): value is AgentVoice =>
  typeof value === 'string' && (AGENT_VOICES as readonly string[]).includes(value);

/** The form as the user last saved it, else the app's standard values. */
export function formFromDefaults(
  saved: SavedAgentDefaults | null,
  fallback: SettingsFallbacks,
): AgentSettingsForm {
  const agent = saved?.agentConfig;
  const schedule = saved?.schedule;
  return {
    agentName: agent?.agentName ?? STANDARD_AGENT_NAME,
    organizationName: agent?.organizationName ?? '',
    objective: agent?.objective ?? '',
    language: agent?.language ?? fallback.language,
    voice: isAgentVoice(agent?.voice) ? agent.voice : 'alloy',
    disclosure: agent?.disclosure || fallback.disclosure,
    questions: saved?.questions ?? fallback.questions,
    windowStart: schedule?.callWindow?.start ?? STANDARD_WINDOW.start,
    windowEnd: schedule?.callWindow?.end ?? STANDARD_WINDOW.end,
    daysOfWeek: schedule?.daysOfWeek?.length ? [...schedule.daysOfWeek] : [...STANDARD_DAYS],
    timezone: schedule?.timezone ?? fallback.timezone,
    maxAttemptsPerLead: String(schedule?.maxAttemptsPerLead ?? STANDARD_RETRY.maxAttemptsPerLead),
    retryDelayMinutes: String(schedule?.retryDelayMinutes ?? STANDARD_RETRY.retryDelayMinutes),
    maxCallsPerDay: String(schedule?.maxCallsPerDay ?? STANDARD_RETRY.maxCallsPerDay),
    smsPurpose: saved?.sms?.purpose ?? 'promotional',
    smsTemplateId: saved?.sms?.templateId ?? null,
  };
}

/** Whole number within the limits, else null. */
export function parseLimited(value: string, key: ScheduleLimitKey): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value.trim());
  const { min, max } = SCHEDULE_LIMITS[key];
  return number >= min && number <= max ? number : null;
}

export type SettingsErrorKey =
  | 'agentName'
  | 'language'
  | 'disclosure'
  | 'questions'
  | 'windowStart'
  | 'windowEnd'
  | 'daysOfWeek'
  | 'timezone'
  | ScheduleLimitKey;

export type SettingsErrors = {
  fields: SettingsErrorKey[];
  /** Indexes of incomplete questions (QuestionListEditor marks them). */
  questions: number[];
};

/** Same rules the server enforces, checked before the request so the user sees them inline. */
export function settingsErrors(form: AgentSettingsForm): SettingsErrors {
  const fields: SettingsErrorKey[] = [];
  if (!form.agentName.trim()) fields.push('agentName');
  if (!form.language.trim()) fields.push('language');
  // The agent must always say it is an AI: an empty disclosure is never saved.
  if (!form.disclosure.trim()) fields.push('disclosure');
  const questions = questionErrors(form.questions);
  if (form.questions.length === 0 || questions.length > 0) fields.push('questions');
  if (!isValidTime(form.windowStart)) fields.push('windowStart');
  if (!isValidTime(form.windowEnd)) fields.push('windowEnd');
  if (form.daysOfWeek.length === 0) fields.push('daysOfWeek');
  if (!isValidTimezone(form.timezone.trim())) fields.push('timezone');
  for (const key of Object.keys(SCHEDULE_LIMITS) as ScheduleLimitKey[]) {
    if (parseLimited(form[key], key) === null) fields.push(key);
  }
  return { fields, questions };
}

/** Server body for PATCH /users/me/preferences { aiAgentDefaults }. Call only when the form is valid. */
export function toDefaultsPayload(form: AgentSettingsForm): AgentDefaultsInput {
  const sortedDays = [...new Set(form.daysOfWeek)].sort((a, b) => a - b);
  return {
    agentConfig: {
      agentName: form.agentName.trim(),
      organizationName: form.organizationName.trim(),
      objective: form.objective.trim(),
      language: form.language,
      voice: form.voice,
      disclosure: form.disclosure.trim(),
    },
    questions: toQuestionnaire(form.questions).questions,
    schedule: {
      timezone: form.timezone.trim(),
      callWindow: { start: form.windowStart, end: form.windowEnd },
      daysOfWeek: sortedDays,
      maxAttemptsPerLead: parseLimited(form.maxAttemptsPerLead, 'maxAttemptsPerLead') ?? 0,
      retryDelayMinutes: parseLimited(form.retryDelayMinutes, 'retryDelayMinutes') ?? 0,
      maxCallsPerDay: parseLimited(form.maxCallsPerDay, 'maxCallsPerDay') ?? 0,
    },
    sms: { purpose: form.smsPurpose, templateId: form.smsTemplateId },
  };
}

/** Schedule fields beyond the call window that a campaign should inherit from the defaults. */
export function scheduleExtras(saved: SavedAgentDefaults | null): Partial<CallCampaignInput['schedule']> {
  const schedule = saved?.schedule;
  if (!schedule) return {};
  const extras: Partial<CallCampaignInput['schedule']> = {};
  if (schedule.daysOfWeek?.length) extras.daysOfWeek = schedule.daysOfWeek;
  if (schedule.maxAttemptsPerLead !== null) extras.maxAttemptsPerLead = schedule.maxAttemptsPerLead;
  if (schedule.retryDelayMinutes !== null) extras.retryDelayMinutes = schedule.retryDelayMinutes;
  if (schedule.maxCallsPerDay !== null) extras.maxCallsPerDay = schedule.maxCallsPerDay;
  return extras;
}

/**
 * A test draft built from the saved defaults: the same agent and questions a real
 * campaign would get, marked `isTest` so it can never change a lead. The server
 * only creates a campaign for at least one lead, so the caller passes one.
 */
export function testDraftInput(
  form: AgentSettingsForm,
  leadId: string,
  name: string,
): CallCampaignInput & { isTest: true } {
  const payload = toDefaultsPayload(form);
  return {
    name,
    isTest: true,
    questionnaire: { questions: payload.questions },
    statusRules: defaultStatusRules(form.questions),
    agentConfig: payload.agentConfig,
    schedule: payload.schedule,
    selection: { mode: 'explicit', leadIds: [leadId] },
  };
}

/** The first letter of the agent's name, for the avatar. */
export function agentInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase() : 'A';
}
