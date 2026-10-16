// The user's AI agent defaults (server: users.preferences.aiAgentDefaults, written by
// PATCH /users/me/preferences and validated there with the AI calling campaign rules).
// Parsing is tolerant: a missing or malformed field becomes null and the app falls
// back to its own standard value, so an old or partial record never breaks a screen.
import { z } from 'zod';

import { MESSAGE_PURPOSES, type AgentQuestion, type MessagePurpose } from '@/features/aiAgent/types';

/**
 * OpenAI Realtime voices the agent worker accepts. Mirrors the server allow-list
 * (server/src/modules/auth/user.validation.js AI_AGENT_VOICES) and the web wizard.
 */
export const AGENT_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'] as const;
export type AgentVoice = (typeof AGENT_VOICES)[number];

/**
 * Retry and pacing limits. Minimums and the attempts maximum are the server's
 * (aiCalling.validation.js schedule); the other maximums are app-side sanity caps.
 */
export const SCHEDULE_LIMITS = {
  maxAttemptsPerLead: { min: 1, max: 10 },
  retryDelayMinutes: { min: 1, max: 10_080 },
  maxCallsPerDay: { min: 1, max: 10_000 },
} as const;
export type ScheduleLimitKey = keyof typeof SCHEDULE_LIMITS;

/** 0 = Sunday … 6 = Saturday (the server's convention). */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

const text = z
  .string()
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);
const int = z
  .number()
  .int()
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

const savedQuestionSchema = z
  .object({
    fieldKey: z.string(),
    label: z.string().catch(''),
    text: z.string().catch(''),
    type: z.string().catch('short_text'),
    required: z.boolean().catch(false),
    options: z
      .array(z.union([z.string(), z.object({ value: z.string() })]))
      .nullish()
      .catch([]),
    mapTo: z.string().nullish().catch(null),
  })
  .transform(
    (raw): AgentQuestion => ({
      fieldKey: raw.fieldKey,
      label: raw.label,
      text: raw.text,
      type: raw.type as AgentQuestion['type'],
      required: raw.required,
      options: (raw.options ?? []).map((option) => (typeof option === 'string' ? option : option.value)),
      mapTo: raw.mapTo ?? null,
    }),
  );

export const savedDefaultsSchema = z.object({
  agentConfig: z
    .object({
      agentName: text,
      organizationName: text,
      objective: text,
      language: text,
      voice: text,
      disclosure: text,
    })
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
  questions: z
    .array(savedQuestionSchema)
    .nullish()
    .catch(null)
    .transform((value) => (value && value.length > 0 ? value : null)),
  schedule: z
    .object({
      timezone: text,
      callWindow: z
        .object({ start: text, end: text })
        .nullish()
        .catch(null)
        .transform((value) => value ?? null),
      daysOfWeek: z
        .array(z.number().int().min(0).max(6))
        .nullish()
        .catch(null)
        .transform((value) => value ?? null),
      maxAttemptsPerLead: int,
      retryDelayMinutes: int,
      maxCallsPerDay: int,
    })
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
  sms: z
    .object({
      purpose: z.enum(MESSAGE_PURPOSES).nullish().catch(null),
      templateId: text,
    })
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
  updatedAt: text,
});
/** What the server has saved; every field may be missing (null). */
export type SavedAgentDefaults = z.infer<typeof savedDefaultsSchema>;

const defaultsOrNull = savedDefaultsSchema
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

/** GET /users/me — only the part this feature needs. */
export const meDefaultsSchema = z
  .object({
    preferences: z.object({ aiAgentDefaults: defaultsOrNull }).nullish().catch(null),
  })
  .transform((me) => me.preferences?.aiAgentDefaults ?? null);

/** PATCH /users/me/preferences → { preferences }. */
export const preferencesResponseSchema = z
  .object({ preferences: z.object({ aiAgentDefaults: defaultsOrNull }).nullish().catch(null) })
  .transform((body) => body.preferences?.aiAgentDefaults ?? null);

/** Body of `aiAgentDefaults` in PATCH /users/me/preferences (server shape). */
export type AgentDefaultsInput = {
  agentConfig: {
    agentName: string;
    organizationName: string;
    objective: string;
    language: string;
    voice: AgentVoice;
    disclosure: string;
  };
  questions: (Omit<AgentQuestion, 'options'> & {
    order: number;
    options: { value: string; label: string }[];
  })[];
  schedule: {
    timezone: string;
    callWindow: { start: string; end: string };
    daysOfWeek: number[];
    maxAttemptsPerLead: number;
    retryDelayMinutes: number;
    maxCallsPerDay: number;
  };
  sms: { purpose: MessagePurpose; templateId: string | null };
};

/** Lead picker purpose: who the chosen leads are for. */
export type PickerPurpose = 'call' | 'sms' | 'test';
