/**
 * Per-call quality telemetry, measured by the worker and reported once with /end.
 *
 * Everything here is an observation of this call, never an estimate:
 *  - latency: end of the caller's speech (the session's user state leaves "speaking")
 *    → the agent's next audio (agent state becomes "speaking"). With OpenAI server
 *    VAD the "end of speech" event itself fires after the configured silence window,
 *    so the samples exclude that window (reported as `vadSilenceMs`). A turn that the
 *    silence watchdog had to re-prompt is not a latency sample (it is a silence event).
 *  - modelTtftMs: the realtime model's own time-to-first-audio per response, from
 *    LiveKit's MetricsCollected events (a separate, server-side view of the same delay).
 *  - interruptions: agent messages the caller cut off; bargeIns: caller speech that
 *    started while the agent was speaking.
 *  - audioFailures: room/track/session faults as they happened.
 *  - transcript: turns the session produced per speaker, and whether one side spoke
 *    but produced no transcript (missing).
 */

const MAX_SAMPLES = 200;
const MAX_FAILURES = 50;
const MAX_SAMPLE_MS = 60_000;

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  // Nearest-rank: the smallest value with at least p% of samples at or below it.
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1];
}

const textOf = (item) => {
  const content = Array.isArray(item?.content)
    ? item.content.map((part) => (typeof part === 'string' ? part : part?.text || part?.transcript || '')).join(' ')
    : '';
  return String(item?.textContent || content || '').trim();
};

export function createQualityTelemetry({ now = () => Date.now(), vadSilenceMs = null } = {}) {
  const samples = [];
  const ttft = [];
  const failures = [];
  const languages = new Map();
  const seenItems = new Set();
  let pendingUserEnd = null;
  let agentSpeaking = false;
  let userSpeechSegments = 0;
  let agentSpeechSegments = 0;
  let interruptions = 0;
  let bargeIns = 0;
  let silenceEvents = 0;
  let leadTurns = 0;
  let agentTurns = 0;
  let emptyTurns = 0;
  let droppedSamples = 0;
  let answered = false;

  const pushFailure = (type, detail = null) => {
    if (failures.length >= MAX_FAILURES) return;
    failures.push({ type: String(type).slice(0, 60), at: new Date(now()).toISOString(), ...(detail ? { detail: String(detail).slice(0, 200) } : {}) });
  };

  return {
    markAnswered() { answered = true; },
    onUserState(newState) {
      if (newState === 'speaking') {
        userSpeechSegments += 1;
        pendingUserEnd = null; // still talking: the turn has not ended
        if (agentSpeaking) bargeIns += 1;
      } else if (newState === 'listening') {
        pendingUserEnd = now();
      }
    },
    onAgentState(newState) {
      const speaking = newState === 'speaking';
      if (speaking && !agentSpeaking) {
        agentSpeechSegments += 1;
        if (pendingUserEnd != null) {
          const ms = now() - pendingUserEnd;
          if (ms >= 0 && ms <= MAX_SAMPLE_MS) {
            if (samples.length < MAX_SAMPLES) samples.push(ms); else droppedSamples += 1;
          }
          pendingUserEnd = null;
        }
      }
      agentSpeaking = speaking;
    },
    onConversationItem(item) {
      if (!item || !['user', 'assistant'].includes(item.role)) return;
      const key = item.id || null;
      if (key) { if (seenItems.has(key)) return; seenItems.add(key); }
      const text = textOf(item);
      if (!text) { emptyTurns += 1; return; }
      if (item.role === 'user') leadTurns += 1;
      else { agentTurns += 1; if (item.interrupted) interruptions += 1; }
    },
    onUserTranscribed(ev) {
      if (ev?.isFinal && ev.language) languages.set(ev.language, (languages.get(ev.language) || 0) + 1);
    },
    onMetrics(metrics) {
      if (metrics?.type === 'realtime_model_metrics' && Number.isFinite(metrics.ttftMs) && metrics.ttftMs >= 0 && !metrics.cancelled && ttft.length < MAX_SAMPLES) {
        ttft.push(Math.round(metrics.ttftMs));
      }
    },
    /** The silence watchdog fired: the pending turn is a re-prompt, not a reply. */
    onSilence() { silenceEvents += 1; pendingUserEnd = null; },
    onAudioFailure(type, detail) { pushFailure(type, detail); },
    /** `historyItems`: the session history at the end, so turns whose event was missed still count. */
    summary(historyItems = []) {
      for (const item of historyItems || []) this.onConversationItem(item);
      const sorted = [...samples].sort((a, b) => a - b);
      const ttftSorted = [...ttft].sort((a, b) => a - b);
      const language = [...languages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const missing = answered && ((leadTurns + agentTurns === 0)
        || (userSpeechSegments > 0 && leadTurns === 0)
        || (agentSpeechSegments > 0 && agentTurns === 0));
      return {
        version: 1,
        latency: {
          p50Ms: percentile(sorted, 50), p95Ms: percentile(sorted, 95), maxMs: sorted.length ? sorted.at(-1) : null,
          samples: sorted.length, samplesMs: samples.slice(0, MAX_SAMPLES), dropped: droppedSamples,
          ...(vadSilenceMs != null ? { vadSilenceMs } : {}),
        },
        modelTtft: { p50Ms: percentile(ttftSorted, 50), p95Ms: percentile(ttftSorted, 95), samples: ttftSorted.length },
        interruptions,
        bargeIns,
        silenceEvents,
        audioFailures: failures.slice(),
        transcript: { turns: leadTurns + agentTurns, leadTurns, agentTurns, emptyTurns, userSpeechSegments, agentSpeechSegments, missing: Boolean(missing) },
        ...(language ? { languageDetected: String(language).slice(0, 20) } : {}),
        answered,
      };
    },
  };
}

/**
 * Wire the collector to the LiveKit session and room. Listeners only observe;
 * they never change call flow.
 */
export function attachQualityTelemetry({ session, room, quality, events }) {
  session.on(events.UserStateChanged, (ev) => quality.onUserState(ev?.newState));
  session.on(events.AgentStateChanged, (ev) => quality.onAgentState(ev?.newState));
  session.on(events.ConversationItemAdded, (ev) => quality.onConversationItem(ev?.item));
  session.on(events.UserInputTranscribed, (ev) => quality.onUserTranscribed(ev));
  if (events.MetricsCollected) session.on(events.MetricsCollected, (ev) => quality.onMetrics(ev?.metrics));
  // VAD heard the caller but no transcript came back for that speech.
  if (events.UserTranscriptionTimeout) session.on(events.UserTranscriptionTimeout, () => quality.onAudioFailure('transcription_timeout'));
  session.on(events.Error, (ev) => {
    const error = ev?.error;
    quality.onAudioFailure(error?.recoverable === false ? 'session_fatal' : 'session_error', error?.error?.message || error?.message || '');
  });
  room?.on?.('reconnecting', () => quality.onAudioFailure('room_reconnecting'));
  room?.on?.('reconnected', () => quality.onAudioFailure('room_reconnected'));
  room?.on?.('trackSubscriptionFailed', (_trackSid, _participant, reason) => quality.onAudioFailure('track_subscription_failed', reason));
  room?.on?.('disconnected', (reason) => quality.onAudioFailure('room_disconnected', reason));
}
