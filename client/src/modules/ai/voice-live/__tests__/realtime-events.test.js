import { describe, expect, test } from 'vitest';
import { INITIAL_CONVERSATION, functionCallsOf, levelFromSamples, reduceConversation } from '../realtime-events';

const run = (events, start = INITIAL_CONVERSATION) => events.reduce(reduceConversation, start);

describe('reduceConversation', () => {
  test('a spoken turn: hearing → thinking → speaking → listening, captions in order', () => {
    const s = run([
      { type: 'input_audio_buffer.speech_started', item_id: 'u1' },
      { type: 'conversation.item.input_audio_transcription.delta', item_id: 'u1', delta: 'What is ' },
      { type: 'input_audio_buffer.speech_stopped', item_id: 'u1' },
      { type: 'response.created' },
      { type: 'response.output_audio_transcript.delta', item_id: 'a1', delta: 'You have ' },
      { type: 'output_audio_buffer.started' },
      // the user transcription completes after the answer started — order must hold
      { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'What is on today?' },
      { type: 'response.output_audio_transcript.done', item_id: 'a1', transcript: 'You have two meetings.' },
      { type: 'response.done', response: { status: 'completed', output: [] } },
    ]);
    expect(s.activity).toBe('speaking');
    expect(s.transcript).toEqual([
      { id: 'u1', role: 'user', text: 'What is on today?', final: true },
      { id: 'a1', role: 'assistant', text: 'You have two meetings.', final: true },
    ]);
    const after = reduceConversation(s, { type: 'output_audio_buffer.stopped' });
    expect(after.activity).toBe('listening');
  });

  test('state per event', () => {
    expect(run([{ type: 'input_audio_buffer.speech_started', item_id: 'x' }]).activity).toBe('user_speaking');
    expect(run([{ type: 'input_audio_buffer.speech_stopped' }]).activity).toBe('thinking');
    expect(run([{ type: 'response.created' }]).activity).toBe('thinking');
  });

  test('tools keep the orb "working" until the last one finishes, even if audio stops', () => {
    let s = run([{ type: 'local.tool_started' }, { type: 'local.tool_started' }]);
    expect(s.activity).toBe('working');
    s = reduceConversation(s, { type: 'output_audio_buffer.stopped' });
    expect(s.activity).toBe('working');
    s = reduceConversation(s, { type: 'local.tool_finished' });
    expect(s.activity).toBe('working');
    s = reduceConversation(s, { type: 'local.tool_finished' });
    expect(s.activity).toBe('thinking');
    expect(s.toolsRunning).toBe(0);
  });

  test('empty or failed transcriptions disappear instead of leaving blank bubbles', () => {
    const s = run([
      { type: 'input_audio_buffer.speech_started', item_id: 'u1' },
      { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: '  ' },
      { type: 'input_audio_buffer.speech_started', item_id: 'u2' },
      { type: 'conversation.item.input_audio_transcription.failed', item_id: 'u2' },
    ]);
    expect(s.transcript).toEqual([]);
  });

  test('typed text joins the transcript; reset clears everything', () => {
    const s = run([{ type: 'local.user_text', id: 'l1', text: 'Create a lead' }]);
    expect(s.transcript[0]).toMatchObject({ role: 'user', text: 'Create a lead', final: true });
    expect(reduceConversation(s, { type: 'local.reset' })).toBe(INITIAL_CONVERSATION);
  });

  test('failed responses surface an error; unknown events are ignored', () => {
    const s = reduceConversation(INITIAL_CONVERSATION, { type: 'response.done', response: { status: 'failed', status_details: { error: { message: 'quota' } } } });
    expect(s.lastError).toBe('quota');
    expect(reduceConversation(s, { type: 'rate_limits.updated' })).toBe(s);
  });

  test('transcript is capped', () => {
    const events = Array.from({ length: 80 }, (_, i) => ({ type: 'local.user_text', id: `t${i}`, text: `m${i}` }));
    const s = run(events);
    expect(s.transcript).toHaveLength(60);
    expect(s.transcript.at(-1).text).toBe('m79');
  });
});

describe('functionCallsOf', () => {
  test('extracts calls with parsed arguments; tolerates bad JSON', () => {
    const calls = functionCallsOf({
      type: 'response.done',
      response: { output: [
        { type: 'message', role: 'assistant' },
        { type: 'function_call', call_id: 'c1', name: 'crm_request', arguments: '{"request":"Create task"}' },
        { type: 'function_call', call_id: 'c2', name: 'get_my_day', arguments: '{bad' },
      ] },
    });
    expect(calls).toEqual([
      { callId: 'c1', name: 'crm_request', args: { request: 'Create task' } },
      { callId: 'c2', name: 'get_my_day', args: {} },
    ]);
    expect(functionCallsOf({ type: 'response.created' })).toEqual([]);
  });
});

describe('levelFromSamples', () => {
  test('silence is 0, loud is near 1, always within 0..1', () => {
    expect(levelFromSamples(new Uint8Array(256).fill(128))).toBe(0);
    const loud = new Uint8Array(256).map((_, i) => (i % 2 ? 255 : 0));
    expect(levelFromSamples(loud)).toBeGreaterThan(0.9);
    expect(levelFromSamples(loud)).toBeLessThanOrEqual(1);
    expect(levelFromSamples(null)).toBe(0);
  });
});
