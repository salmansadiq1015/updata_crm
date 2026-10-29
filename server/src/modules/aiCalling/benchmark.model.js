import mongoose from 'mongoose';
import { questionSchema } from './callCampaign.model.js';

// Snapshots may hold draft questions (label/text not yet filled), like CallingAgent.
const snapshotQuestionSchema = questionSchema.clone();
snapshotQuestionSchema.path('label').required(false);
snapshotQuestionSchema.path('text').required(false);

/**
 * Quality benchmarks for the calling pipeline.
 *
 * BenchmarkSuite: a questionnaire plus cases. BenchmarkCase: one conversation with a
 * language tag (ur | en | mixed), recording conditions, the lead/agent turns, optional
 * audio, and human-REVIEWED ground truth. A case counts toward scores only once a
 * reviewer approved it; any edit to its content withdraws that approval.
 * BenchmarkRun: one execution against a suite, with per-case results and metrics.
 */

export const BENCHMARK_LANGUAGES = ['ur', 'en', 'mixed'];
export const BENCHMARK_CONDITIONS = ['clean', 'noise', 'interruption'];
export const BENCHMARK_RUN_STATUSES = ['queued', 'running', 'completed', 'failed'];

const suiteSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  sample: { type: Boolean, default: false },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallingAgent', default: null },
  questionnaire: { questions: { type: [snapshotQuestionSchema], default: [] } },
  archivedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });
suiteSchema.index({ createdBy: 1, archivedAt: 1, updatedAt: -1 });

const turnSchema = new mongoose.Schema({
  speaker: { type: String, enum: ['lead', 'agent'], required: true },
  text: { type: String, maxlength: 4000, default: '' },
  // Optional timing (ms from call start). Overlapping ranges model interruptions.
  startMs: { type: Number, min: 0, default: null },
  endMs: { type: Number, min: 0, default: null },
  // The field a lead turn answers when it is not the current question (volunteered answer).
  fieldKey: { type: String, maxlength: 80, default: null },
}, { _id: false });

const expectedAnswerSchema = new mongoose.Schema({
  fieldKey: { type: String, required: true, maxlength: 80 },
  expected: { type: mongoose.Schema.Types.Mixed, default: null },
  // The lead explicitly said they don't know: the correct capture is "unknown", not a value.
  expectUnknown: { type: Boolean, default: false },
}, { _id: false });

const expectedItemSchema = new mongoose.Schema({
  category: { type: String, required: true, maxlength: 80 },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const caseSchema = new mongoose.Schema({
  suiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'BenchmarkSuite', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  language: { type: String, enum: BENCHMARK_LANGUAGES, required: true },
  conditions: { type: [{ type: String, enum: BENCHMARK_CONDITIONS }], default: ['clean'] },
  turns: { type: [turnSchema], default: [] },
  audio: {
    type: new mongoose.Schema({
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileMetadata', required: true },
      mimeType: { type: String, maxlength: 80, default: null },
      // Reviewed verbatim transcript of the audio (WER reference).
      referenceTranscript: { type: String, maxlength: 20000, default: '' },
      // Language passed to STT (defaults: ur→ur, en→en, mixed→ur).
      sttLanguage: { type: String, maxlength: 10, default: null },
    }, { _id: false }),
    default: undefined,
  },
  groundTruth: {
    answers: { type: [expectedAnswerSchema], default: [] },
    extraction: { type: [expectedItemSchema], default: [] },
  },
  // Clearly-labelled starter examples; never reviewed automatically.
  sample: { type: Boolean, default: false },
  reviewed: { type: Boolean, default: false },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
  revision: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });
caseSchema.index({ suiteId: 1, createdAt: 1 });

const runSchema = new mongoose.Schema({
  suiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'BenchmarkSuite', required: true },
  status: { type: String, enum: BENCHMARK_RUN_STATUSES, default: 'queued' },
  label: { type: String, trim: true, maxlength: 160, default: '' },
  options: {
    includeExtractor: { type: Boolean, default: false },
    includeAudio: { type: Boolean, default: false },
  },
  // What was evaluated: the agent script version (its questionnaire) and the knowledge version.
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallingAgent', default: null },
  scriptVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentScriptVersion', default: null },
  knowledgeVersionId: { type: String, maxlength: 80, default: null },
  questionnaireSource: { type: String, enum: ['suite', 'script_version'], default: 'suite' },
  questionnaireHash: { type: String, maxlength: 64, default: null },
  extractor: { type: String, maxlength: 200, default: null }, // module/function used, or why none
  caseResults: { type: [mongoose.Schema.Types.Mixed], default: [] },
  metrics: { type: mongoose.Schema.Types.Mixed, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  error: { type: String, maxlength: 1000, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });
runSchema.index({ suiteId: 1, createdAt: -1 });
runSchema.index({ scriptVersionId: 1, createdAt: -1 }, { partialFilterExpression: { scriptVersionId: { $type: 'objectId' } } });
runSchema.index({ status: 1, startedAt: 1 });

export const BenchmarkSuite = mongoose.model('BenchmarkSuite', suiteSchema);
export const BenchmarkCase = mongoose.model('BenchmarkCase', caseSchema);
export const BenchmarkRun = mongoose.model('BenchmarkRun', runSchema);
export default { BenchmarkSuite, BenchmarkCase, BenchmarkRun };
