// Calling quality dashboard, benchmarks and script experiments (server: callingQuality.routes.js).

export type QualityFlag = 'high_latency' | 'missing_transcript' | 'transcript_not_persisted' | 'audio_failure' | 'extraction_error';
export interface QualityFilters {
  from?: string; to?: string; agentId?: string; campaignId?: string; language?: string; provider?: string; latencyThresholdMs?: number;
}
export interface QualityBlock {
  calls: number; withTelemetry: number; notRecorded: number;
  latency: { p50Ms: number | null; p95Ms: number | null; maxMs: number | null; samples: number; callsWithSamples: number; highLatencyCalls: number; vadSilenceMs: number | null };
  transcripts: { recorded: number; missing: number; notPersisted: number; missingRate: number | null };
  audio: { recorded: number; callsWithFailures: number; rate: number | null; pairedAudioLost: number };
  interruptions: { total: number; perCall: number | null };
  silenceEvents: { total: number; perCall: number | null };
  extraction: { recorded: number; notRecorded: number; errors: number; rate: number | null; rejectedItems: number };
}
export interface QualityBreakdownRow {
  key: string; label: string; calls: number; withTelemetry: number; p50Ms: number | null; p95Ms: number | null;
  missingTranscripts: number; audioFailureCalls: number; extractionErrors: number; extractionRecorded: number;
}
export interface QualitySummary {
  latencyThresholdMs: number;
  totals: QualityBlock & { flaggedCalls: number };
  failureTypes: Array<{ type: QualityFlag; calls: number }>;
  audioFailureTypes: Array<{ type: string; count: number }>;
  byDay: Array<{ date: string; calls: number; withTelemetry: number; flagged: number; samples: number; p50Ms: number | null; p95Ms: number | null }>;
  breakdown: { byLanguage: QualityBreakdownRow[]; byProvider: QualityBreakdownRow[]; byAgent: QualityBreakdownRow[] };
  facets: { agents: Array<{ id: string; name: string }>; campaigns: Array<{ id: string; name: string; agentId: string | null }>; languages: string[]; providers: string[] };
  truncated: boolean;
}
export interface FlaggedCall {
  id: string; internalCallId: string; at: string; leadId: string; leadName: string; campaignId: string; campaignName: string;
  agentId: string | null; agentName: string; provider: string | null; language: string; languageSource: 'detected' | 'configured';
  durationSeconds: number; disposition: string | null; flags: QualityFlag[]; telemetry: boolean;
  latency: { p50Ms: number | null; p95Ms: number | null; maxMs: number | null; samples: number } | null;
  audioFailures: string[];
  transcript: { turns?: number; leadTurns?: number; agentTurns?: number; missing?: boolean; persistedTurns: number };
  extraction: { error: boolean; status: string; rejectedItems: number; correctedItems: number } | null;
  experiment: { id: string; arm: string } | null;
}
export interface FlaggedPage {
  calls: FlaggedCall[]; pagination: { page: number; limit: number; total: number; pages: number }; latencyThresholdMs: number; truncated: boolean;
}

// ---- benchmarks
export type BenchmarkLanguage = 'ur' | 'en' | 'mixed';
export type BenchmarkCondition = 'clean' | 'noise' | 'interruption';
export interface BenchmarkQuestion { fieldKey: string; label?: string; text?: string; type: string; options?: Array<string | { value: string; label?: string }>; min?: number | null; max?: number | null }
export interface BenchmarkTurn { speaker: 'lead' | 'agent'; text: string; startMs?: number | null; endMs?: number | null; fieldKey?: string | null }
export interface ExpectedAnswer { fieldKey: string; expected?: unknown; expectUnknown?: boolean }
export interface BenchmarkCase {
  _id: string; suiteId: string; title: string; notes: string; language: BenchmarkLanguage; conditions: BenchmarkCondition[];
  turns: BenchmarkTurn[]; audio?: { fileId: string; mimeType?: string | null; referenceTranscript: string; sttLanguage?: string | null } | null;
  groundTruth: { answers: ExpectedAnswer[]; extraction: Array<{ category: string; value: unknown }> };
  sample: boolean; reviewed: boolean; reviewedBy: string | null; reviewedAt: string | null; reviewNote: string; revision: number; updatedAt: string;
}
export type BenchmarkCaseInput = Partial<Pick<BenchmarkCase, 'title' | 'notes' | 'language' | 'conditions' | 'turns' | 'groundTruth' | 'audio'>>;
export interface BenchmarkMetrics {
  cases: number; expectedFields: number; fieldAccuracy: number | null; exactMatchRate: number | null; missRate: number | null;
  wrongRate: number | null; falsePositiveRate: number | null; falsePositives: number;
  extraction: { cases: number; precision: number | null; recall: number | null } | null;
  wer: { cases: number; value: number | null; referenceWords: number } | null;
}
export interface BenchmarkFieldResult { fieldKey: string; expected: unknown; predicted: unknown; validation: string | null; outcome: 'exact' | 'normalized' | 'wrong' | 'missed' | 'false_positive' | 'correct_empty' }
export interface BenchmarkCaseResult {
  caseId: string; caseRevision: number; title: string; language: BenchmarkLanguage; conditions: BenchmarkCondition[];
  scored: boolean; sample: boolean; fields: BenchmarkFieldResult[];
  extraction: { status: string; tp?: number; fp?: number; fn?: number; precision?: number | null; recall?: number | null; needsReview?: number | null; error?: string };
  audio: { status: string; wer?: number | null; hypothesis?: string; error?: string };
}
export interface BenchmarkRun {
  _id: string; suiteId: string; status: 'queued' | 'running' | 'completed' | 'failed'; label: string;
  options: { includeExtractor: boolean; includeAudio: boolean }; scriptVersionId: string | null; knowledgeVersionId: string | null;
  questionnaireSource: 'suite' | 'script_version'; extractor: string | null;
  metrics: { overall: BenchmarkMetrics; byLanguage: Record<string, BenchmarkMetrics>; byCondition: Record<string, BenchmarkMetrics>; unreviewedExcluded: number } | null;
  caseResults?: BenchmarkCaseResult[]; createdAt: string; completedAt: string | null; error: string | null;
}
export interface BenchmarkSuite {
  _id: string; name: string; description: string; sample: boolean; agentId: string | null; questionnaire: { questions: BenchmarkQuestion[] };
  archivedAt: string | null; updatedAt: string; cases?: number; reviewedCases?: number;
  lastRun?: { _id: string; status: string; createdAt: string; metrics: BenchmarkMetrics | null } | null;
  caseList?: BenchmarkCase[];
}
export interface MetricDelta { a: number | null; b: number | null; delta: number | null }
export interface RunComparison {
  a: { id: string; label: string; createdAt: string; status: string }; b: { id: string; label: string; createdAt: string; status: string };
  sameSuite: boolean;
  overall: Record<'fieldAccuracy' | 'exactMatchRate' | 'missRate' | 'falsePositiveRate', MetricDelta>;
  byLanguage: Array<{ key: string; casesA: number; casesB: number; fieldAccuracy: MetricDelta }>;
  byCondition: Array<{ key: string; casesA: number; casesB: number; fieldAccuracy: MetricDelta }>;
  cases: Array<{ caseId: string; title: string; language: string; sameRevision: boolean; correctA: number; correctB: number; fields: number }>;
}

// ---- script versions + experiments
export interface ScriptAgentConfig { objective?: string; speakingStyle?: string; customStyle?: string; disclosure?: string; voice?: string; language?: string; organizationName?: string }
export interface ScriptVersion {
  _id: string; agentId: string; number: number; label: string; note: string; source: 'agent' | 'variant'; basedOnVersionId: string | null;
  snapshot: { agentConfig: ScriptAgentConfig & Record<string, unknown>; questionnaire: { questions: BenchmarkQuestion[] } };
  createdAt: string; active?: boolean; existing?: boolean;
  latestBenchmark?: { runId: string; completedAt: string; overall: BenchmarkMetrics | null } | null;
}
export interface ScriptState {
  agentId: string; activeVersion: { _id: string; number: number; label: string } | null; liveMatchesActive: boolean | null; canRollback: boolean;
  activations: Array<{ _id: string; versionId: string; previousVersionId: string | null; action: 'snapshot' | 'promote' | 'rollback'; reason: string; campaignsUpdated: number; createdAt: string }>;
}
export interface Guardrails {
  minCallsPerArm: number; maxFailureRateIncrease: number; maxOptOutRateIncrease: number;
  maxMissingTranscriptRateIncrease: number; maxAudioFailureRateIncrease: number; maxP95LatencyIncreaseMs: number;
}
export interface ProportionTest { control: number | null; variant: number | null; diff: number | null; ciLow: number | null; ciHigh: number | null; pValue: number | null; underpowered: boolean; significant: boolean; n1: number; n2: number }
export interface ArmStats {
  key: string; weight: number; versionId: string; calls: number; connected: number; completed: number; qualified: number; failed: number; optOuts: number;
  connectRate: number | null; completionRate: number | null; qualifiedRate: number | null; failureRate: number | null; optOutRate: number | null; avgCost: number | null;
  quality: { callsWithTelemetry: number; notRecorded: number; p50LatencyMs: number | null; p95LatencyMs: number | null; missingTranscriptRate: number | null; audioFailureRate: number | null };
  underpowered: boolean;
}
export interface Experiment {
  _id: string; agentId: string; name: string; hypothesis: string; status: 'draft' | 'running' | 'paused' | 'completed';
  arms: Array<{ key: string; versionId: string; weight: number; version?: { _id: string; number: number; label: string; snapshot?: { agentConfig: ScriptAgentConfig } } | null; latestBenchmark?: { runId: string; overall: BenchmarkMetrics | null } | null }>;
  campaignIds: string[]; guardrails: Guardrails;
  guardrailStatus: { checkedAt: string | null; state: 'not_checked' | 'ok' | 'insufficient_data' | 'breached' };
  guardrailEvents: Array<{ at: string; arm: string; metric: string; controlValue: number | null; variantValue: number | null; threshold: number | null; controlCalls: number | null; variantCalls: number | null }>;
  startedAt: string | null; pausedAt: string | null; pausedReason: 'manual' | 'guardrail' | 'rollback' | null; completedAt: string | null; promotedArm: string | null;
  version: number; createdAt: string;
  stats?: { minCallsPerArm: number; arms: ArmStats[]; comparisons: Array<{ arm: string; connectRate: ProportionTest; completionRate: ProportionTest; qualifiedRate: ProportionTest }>; totalCalls: number; truncated: boolean };
}
export interface ExperimentInput {
  agentId: string; name: string; hypothesis?: string; arms: Array<{ key: string; versionId: string; weight: number }>;
  campaignIds?: string[]; guardrails?: Partial<Guardrails>;
}
