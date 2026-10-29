import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { attachQualityTelemetry, createQualityTelemetry, percentile } from '../src/qualityTelemetry.js';

const clock = () => { let t = 1_000; return { now: () => t, advance: (ms) => { t += ms; } }; };

test('nearest-rank percentiles', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([100], 95), 100);
  assert.equal(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 50), 50);
  assert.equal(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95), 100);
});

test('latency is end of caller speech to first agent audio; re-prompts and agent-initiated speech are not samples', () => {
  const c = clock();
  const q = createQualityTelemetry({ now: c.now, vadSilenceMs: 600 });
  q.markAnswered();
  q.onAgentState('speaking'); c.advance(2000); q.onAgentState('listening'); // opener: no pending user turn
  q.onUserState('speaking'); c.advance(1500); q.onUserState('listening');
  c.advance(800); q.onAgentState('thinking'); c.advance(400); q.onAgentState('speaking'); // 1200 ms
  c.advance(1000); q.onAgentState('listening');
  q.onUserState('speaking'); c.advance(500); q.onUserState('listening');
  c.advance(300); q.onUserState('speaking'); c.advance(500); q.onUserState('listening'); // caller paused, then continued
  c.advance(700); q.onAgentState('speaking'); // 700 ms from the real end of speech
  q.onAgentState('listening');
  q.onUserState('speaking'); q.onUserState('listening'); q.onSilence(); c.advance(9000); q.onAgentState('speaking'); // re-prompt
  const s = q.summary();
  assert.deepEqual(s.latency.samplesMs, [1200, 700]);
  assert.equal(s.latency.samples, 2);
  assert.equal(s.latency.p50Ms, 700);
  assert.equal(s.latency.maxMs, 1200);
  assert.equal(s.latency.vadSilenceMs, 600);
  assert.equal(s.silenceEvents, 1);
});

test('counts interruptions, barge-ins, turns per speaker and flags a missing transcript', () => {
  const q = createQualityTelemetry();
  q.markAnswered();
  q.onAgentState('speaking'); q.onUserState('speaking'); q.onUserState('listening');
  q.onConversationItem({ id: 'a1', role: 'assistant', content: ['Hello, I am an AI assistant'], interrupted: true });
  q.onConversationItem({ id: 'a1', role: 'assistant', content: ['Hello, I am an AI assistant'], interrupted: true }); // duplicate event
  q.onConversationItem({ id: 'f1', role: 'function', content: [] });
  let s = q.summary();
  assert.equal(s.interruptions, 1);
  assert.equal(s.bargeIns, 1);
  assert.equal(s.transcript.agentTurns, 1);
  assert.equal(s.transcript.leadTurns, 0);
  assert.equal(s.transcript.missing, true, 'the caller spoke but no customer transcript exists');
  s = q.summary([{ id: 'u1', role: 'user', content: ['Haan ji'] }]);
  assert.equal(s.transcript.leadTurns, 1);
  assert.equal(s.transcript.missing, false);
});

test('an unanswered call never reports a missing transcript', () => {
  const s = createQualityTelemetry().summary();
  assert.equal(s.answered, false);
  assert.equal(s.transcript.missing, false);
  assert.equal(s.latency.p50Ms, null);
});

test('detected language is the most frequent final transcript language; model TTFT comes from metrics events', () => {
  const q = createQualityTelemetry();
  q.onUserTranscribed({ isFinal: true, language: 'ur' });
  q.onUserTranscribed({ isFinal: true, language: 'en' });
  q.onUserTranscribed({ isFinal: true, language: 'ur' });
  q.onUserTranscribed({ isFinal: false, language: 'en' });
  q.onMetrics({ type: 'realtime_model_metrics', ttftMs: 420, cancelled: false });
  q.onMetrics({ type: 'realtime_model_metrics', ttftMs: -1, cancelled: false });
  q.onMetrics({ type: 'llm_metrics', ttftMs: 9 });
  const s = q.summary();
  assert.equal(s.languageDetected, 'ur');
  assert.deepEqual(s.modelTtft, { p50Ms: 420, p95Ms: 420, samples: 1 });
});

test('attach wires session and room events into the collector', () => {
  const events = { UserStateChanged: 'u', AgentStateChanged: 'a', ConversationItemAdded: 'c', UserInputTranscribed: 't', MetricsCollected: 'm', UserTranscriptionTimeout: 'x', Error: 'e' };
  const session = new EventEmitter(); const room = new EventEmitter();
  const c = clock();
  const quality = createQualityTelemetry({ now: c.now });
  attachQualityTelemetry({ session, room, quality, events });
  session.emit('u', { newState: 'speaking' }); session.emit('u', { newState: 'listening' });
  c.advance(900); session.emit('a', { newState: 'speaking' });
  session.emit('x', {});
  session.emit('e', { error: { recoverable: true, message: 'socket closed' } });
  room.emit('reconnecting'); room.emit('trackSubscriptionFailed', 'TR_1', {}, 'timeout');
  const s = quality.summary();
  assert.deepEqual(s.latency.samplesMs, [900]);
  assert.deepEqual(s.audioFailures.map(f => f.type), ['transcription_timeout', 'session_error', 'room_reconnecting', 'track_subscription_failed']);
  assert.equal(s.audioFailures[3].detail, 'timeout');
});
