import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { QUESTION_TYPES } from './aiCalling.constants.js';
import { BENCHMARK_CONDITIONS, BENCHMARK_LANGUAGES } from './benchmark.model.js';
import { FLAG_REASONS } from './engine/callQualityTelemetry.js';

const ms = Joi.number().min(0).max(600_000).allow(null);
const count = Joi.number().integer().min(0).max(100_000);

/** Telemetry the voice worker sends with /end (agent-worker/src/qualityTelemetry.js). */
export const qualityTelemetry = Joi.object({
  version: Joi.number().integer().min(1).max(100),
  answered: Joi.boolean(),
  latency: Joi.object({
    p50Ms: ms, p95Ms: ms, maxMs: ms, samples: count, dropped: count, vadSilenceMs: ms,
    samplesMs: Joi.array().items(Joi.number().min(0).max(600_000)).max(500),
  }),
  modelTtft: Joi.object({ p50Ms: ms, p95Ms: ms, samples: count }),
  interruptions: count, bargeIns: count, silenceEvents: count,
  audioFailures: Joi.array().items(Joi.object({
    type: Joi.string().max(60).required(), at: Joi.date().iso(), detail: Joi.string().max(200).allow(''),
  })).max(100),
  transcript: Joi.object({
    turns: count, leadTurns: count, agentTurns: count, emptyTurns: count,
    userSpeechSegments: count, agentSpeechSegments: count, missing: Joi.boolean(),
  }),
  languageDetected: Joi.string().max(20).allow(null, ''),
}).allow(null);

// ---------------------------------------------------------------- quality
const qualityFilters = {
  from: Joi.date().iso(), to: Joi.date().iso(),
  agentId: objectId, campaignId: objectId,
  language: Joi.string().max(20).pattern(/^[a-z]{2,3}([-_][A-Za-z]{2,4})?$|^unknown$/),
  provider: Joi.string().max(40).pattern(/^[a-z_]+$/),
  latencyThresholdMs: Joi.number().integer().min(100).max(60_000),
};
export const qualitySummary = { query: Joi.object(qualityFilters) };
export const qualityFlagged = { query: Joi.object({
  ...qualityFilters,
  reason: Joi.string().valid(...FLAG_REASONS),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
}) };

// ---------------------------------------------------------------- benchmarks
const question = Joi.object({
  fieldKey: Joi.string().trim().max(80).pattern(/^[A-Za-z][\w.]*$/).required(),
  label: Joi.string().trim().max(200).allow(''),
  text: Joi.string().trim().max(1000).allow(''),
  type: Joi.string().valid(...QUESTION_TYPES).required(),
  required: Joi.boolean(), order: Joi.number(),
  options: Joi.array().items(Joi.alternatives(Joi.string().max(200), Joi.object({ value: Joi.string().max(200).required(), label: Joi.string().max(200).allow('') }))).max(50),
  min: Joi.number().allow(null), max: Joi.number().allow(null), maxLength: Joi.number().allow(null),
  confirmCritical: Joi.boolean(), condition: Joi.object().allow(null),
});
const questionnaire = Joi.object({ questions: Joi.array().items(question).max(60).unique('fieldKey').default([]) });

export const createSuite = { body: Joi.object({
  name: Joi.string().trim().min(1).max(160).required(),
  description: Joi.string().trim().max(2000).allow(''),
  agentId: objectId.allow(null),
  questionnaire: questionnaire.default({ questions: [] }),
}) };
export const updateSuite = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().min(1).max(160), description: Joi.string().trim().max(2000).allow(''),
    questionnaire, archived: Joi.boolean(),
  }).min(1),
};
export const suiteId = { params: Joi.object({ id: objectId.required() }) };
export const listSuites = { query: Joi.object({ includeArchived: Joi.boolean().default(false) }) };

const turn = Joi.object({
  speaker: Joi.string().valid('lead', 'agent').required(),
  text: Joi.string().max(4000).allow('').required(),
  startMs: Joi.number().min(0).allow(null), endMs: Joi.number().min(0).allow(null),
  fieldKey: Joi.string().max(80).allow(null, ''),
});
const caseBody = {
  title: Joi.string().trim().min(1).max(200),
  notes: Joi.string().trim().max(2000).allow(''),
  language: Joi.string().valid(...BENCHMARK_LANGUAGES),
  conditions: Joi.array().items(Joi.string().valid(...BENCHMARK_CONDITIONS)).min(1).max(3).unique(),
  turns: Joi.array().items(turn).max(200),
  audio: Joi.object({
    fileId: objectId.required(), mimeType: Joi.string().max(80).allow(null, ''),
    referenceTranscript: Joi.string().max(20000).allow(''), sttLanguage: Joi.string().max(10).allow(null, ''),
  }).allow(null),
  groundTruth: Joi.object({
    answers: Joi.array().items(Joi.object({
      fieldKey: Joi.string().max(80).required(), expected: Joi.any(), expectUnknown: Joi.boolean().default(false),
    })).max(60).unique('fieldKey').default([]),
    extraction: Joi.array().items(Joi.object({ category: Joi.string().max(80).required(), value: Joi.any() })).max(100).default([]),
  }),
};
export const createCase = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ ...caseBody, title: caseBody.title.required(), language: caseBody.language.required(), turns: caseBody.turns.min(1).required() }),
};
export const updateCase = { params: Joi.object({ caseId: objectId.required() }), body: Joi.object(caseBody).min(1) };
export const caseId = { params: Joi.object({ caseId: objectId.required() }) };
export const reviewCase = {
  params: Joi.object({ caseId: objectId.required() }),
  body: Joi.object({ approved: Joi.boolean().required(), revision: Joi.number().integer().min(1).required(), note: Joi.string().trim().max(1000).allow('') }),
};
export const createRun = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    label: Joi.string().trim().max(160).allow(''),
    scriptVersionId: objectId.allow(null),
    knowledgeVersionId: Joi.string().max(80).allow(null, ''),
    includeExtractor: Joi.boolean().default(false),
    includeAudio: Joi.boolean().default(false),
  }).default({}),
};
export const runId = { params: Joi.object({ runId: objectId.required() }) };
export const compareRuns = { query: Joi.object({ a: objectId.required(), b: objectId.required() }) };

// ---------------------------------------------------------------- script versions + experiments
const agentConfigOverrides = Joi.object({
  objective: Joi.string().trim().max(1000).allow(''),
  speakingStyle: Joi.string().max(40),
  customStyle: Joi.string().trim().max(500).allow(''),
  disclosure: Joi.string().trim().max(2000).allow(''),
  voice: Joi.string().trim().max(40),
  language: Joi.string().trim().max(10),
  organizationName: Joi.string().trim().max(200).allow(''),
  maxClarificationsPerQuestion: Joi.number().integer().min(0).max(5),
  allowBargeIn: Joi.boolean(),
  silenceTimeoutSeconds: Joi.number().min(2).max(60),
});
export const listVersions = { query: Joi.object({ agentId: objectId.required() }) };
export const createVersion = { body: Joi.object({
  agentId: objectId.required(),
  source: Joi.string().valid('agent', 'variant').default('agent'),
  basedOnVersionId: objectId.when('source', { is: 'variant', then: Joi.required(), otherwise: Joi.forbidden() }),
  agentConfig: agentConfigOverrides.when('source', { is: 'variant', then: Joi.required(), otherwise: Joi.forbidden() }),
  label: Joi.string().trim().max(160).allow(''),
  note: Joi.string().trim().max(2000).allow(''),
}) };
export const versionId = { params: Joi.object({ id: objectId.required() }) };
export const agentScriptState = { params: Joi.object({ agentId: objectId.required() }) };
export const rollback = {
  params: Joi.object({ agentId: objectId.required() }),
  body: Joi.object({ reason: Joi.string().trim().max(500).allow('') }).default({}),
};

const guardrails = Joi.object({
  minCallsPerArm: Joi.number().integer().min(5).max(10000),
  maxFailureRateIncrease: Joi.number().min(0).max(1),
  maxOptOutRateIncrease: Joi.number().min(0).max(1),
  maxMissingTranscriptRateIncrease: Joi.number().min(0).max(1),
  maxAudioFailureRateIncrease: Joi.number().min(0).max(1),
  maxP95LatencyIncreaseMs: Joi.number().min(0).max(60000),
});
const arms = Joi.array().items(Joi.object({
  key: Joi.string().pattern(/^(control|variant_[1-9])$/).required(),
  versionId: objectId.required(),
  weight: Joi.number().min(1).max(99).required(),
})).min(2).max(4).unique('key').unique('versionId');
export const listExperiments = { query: Joi.object({ agentId: objectId.required() }) };
export const createExperiment = { body: Joi.object({
  agentId: objectId.required(),
  name: Joi.string().trim().min(1).max(160).required(),
  hypothesis: Joi.string().trim().max(2000).allow(''),
  arms: arms.required(),
  campaignIds: Joi.array().items(objectId).max(100).default([]),
  guardrails: guardrails.default({}),
}) };
export const updateExperiment = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    version: Joi.number().integer().min(1).required(),
    name: Joi.string().trim().min(1).max(160), hypothesis: Joi.string().trim().max(2000).allow(''),
    arms, campaignIds: Joi.array().items(objectId).max(100), guardrails,
  }).min(2),
};
export const experimentId = { params: Joi.object({ id: objectId.required() }) };
export const experimentAction = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ reason: Joi.string().trim().max(500).allow('') }).default({}),
};
export const promoteExperiment = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ arm: Joi.string().pattern(/^(control|variant_[1-9])$/).required(), reason: Joi.string().trim().max(500).allow('') }),
};
