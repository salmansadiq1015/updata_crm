/**
 * Call quality telemetry — pure helpers shared by the /end ingestion and the
 * Quality dashboard. Only values the worker measured are used; anything not
 * reported stays null ("not recorded"), never zero.
 */

export const QUALITY_TELEMETRY_VERSION = 1;
export const FLAG_REASONS = ['high_latency', 'missing_transcript', 'transcript_not_persisted', 'audio_failure', 'extraction_error'];
// Room reconnects that recovered are reported but are not failures on their own.
export const BENIGN_AUDIO_EVENTS = new Set(['room_reconnected']);
const MAX_SAMPLES = 200;

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const int = (v) => { const n = num(v); return n == null ? 0 : Math.max(0, Math.round(n)); };

export function percentile(values, p) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1];
}

/**
 * Normalise what the worker sent. Percentiles are recomputed from the raw samples
 * when present, so the stored summary always agrees with its own data.
 */
export function sanitizeTelemetry(input, receivedAt = new Date()) {
  if (!input || typeof input !== 'object') return null;
  const latency = input.latency || {};
  const samplesMs = Array.isArray(latency.samplesMs)
    ? latency.samplesMs.map(num).filter(v => v != null && v >= 0 && v <= 120_000).map(Math.round).slice(0, MAX_SAMPLES)
    : [];
  const fromSamples = samplesMs.length > 0;
  const transcript = input.transcript || {};
  return {
    version: int(input.version) || QUALITY_TELEMETRY_VERSION,
    source: 'agent_worker',
    receivedAt,
    answered: input.answered == null ? null : Boolean(input.answered),
    latency: {
      p50Ms: fromSamples ? percentile(samplesMs, 50) : num(latency.p50Ms),
      p95Ms: fromSamples ? percentile(samplesMs, 95) : num(latency.p95Ms),
      maxMs: fromSamples ? Math.max(...samplesMs) : num(latency.maxMs),
      samples: fromSamples ? samplesMs.length : int(latency.samples),
      samplesMs,
      vadSilenceMs: num(latency.vadSilenceMs),
    },
    modelTtft: input.modelTtft ? { p50Ms: num(input.modelTtft.p50Ms), p95Ms: num(input.modelTtft.p95Ms), samples: int(input.modelTtft.samples) } : null,
    interruptions: int(input.interruptions),
    bargeIns: int(input.bargeIns),
    silenceEvents: int(input.silenceEvents),
    audioFailures: (Array.isArray(input.audioFailures) ? input.audioFailures : []).slice(0, 50).map(f => ({
      type: String(f?.type || 'unknown').slice(0, 60),
      at: f?.at && !Number.isNaN(new Date(f.at).getTime()) ? new Date(f.at) : receivedAt,
      ...(f?.detail ? { detail: String(f.detail).slice(0, 200) } : {}),
    })),
    transcript: {
      turns: int(transcript.turns), leadTurns: int(transcript.leadTurns), agentTurns: int(transcript.agentTurns),
      emptyTurns: int(transcript.emptyTurns), missing: Boolean(transcript.missing),
    },
    languageDetected: input.languageDetected ? String(input.languageDetected).slice(0, 20) : null,
  };
}

/** Audio failures that count (recovered reconnects are excluded). */
export function audioFailuresOf(quality) {
  return (quality?.audioFailures || []).filter(f => !BENIGN_AUDIO_EVENTS.has(f.type));
}

/**
 * Extraction errors from CallRecord.intelligence (callIntelligence.service.js). Absent → null
 * (not recorded); 'skipped' (no lead speech / AI not configured) and an unfinished run are
 * not an extraction either → null. An error is a failed/partial run or an item a reviewer
 * rejected; reviewer corrections are reported alongside.
 */
export function extractionErrorOf(intelligence) {
  if (!intelligence || typeof intelligence !== 'object' || !['ok', 'partial', 'failed', 'needs_review'].includes(intelligence.status)) return null;
  const items = intelligence.items || [];
  const rejected = items.filter(i => ['user_rejected', 'rejected'].includes(i?.status)).length;
  const corrected = items.filter(i => i?.status === 'user_edited').length;
  const statusError = ['failed', 'partial'].includes(intelligence.status);
  return { error: statusError || rejected > 0, status: intelligence.status, rejectedItems: rejected, correctedItems: corrected };
}

/**
 * Why a call is flagged. `persistedTurns` is the number of transcript turns the CRM
 * actually stored; a worker that heard turns but stored none lost the transcript.
 */
export function flagsForCall({ quality, intelligence, persistedTurns = null, pairedAudioLost = false }, { latencyThresholdMs }) {
  const flags = [];
  if (quality) {
    if (quality.latency?.p95Ms != null && quality.latency.p95Ms > latencyThresholdMs) flags.push('high_latency');
    if (quality.transcript?.missing) flags.push('missing_transcript');
    else if (persistedTurns === 0 && (quality.transcript?.turns || 0) > 0) flags.push('transcript_not_persisted');
    if (audioFailuresOf(quality).length) flags.push('audio_failure');
  }
  if (pairedAudioLost && !flags.includes('audio_failure')) flags.push('audio_failure');
  if (extractionErrorOf(intelligence)?.error) flags.push('extraction_error');
  return flags;
}

export const rate = (n, d) => (d ? Number((n / d).toFixed(4)) : null);
