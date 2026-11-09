/**
 * Pure state transitions for the live voice conversation, driven by OpenAI
 * Realtime server events. Kept free of WebRTC so every transition is testable.
 *
 * activity: 'listening' | 'user_speaking' | 'thinking' | 'working' | 'speaking'
 * transcript: [{ id, role: 'user'|'assistant', text, final }]
 */

export const INITIAL_CONVERSATION = Object.freeze({
  activity: 'listening',
  transcript: [],
  speaking: false,
  toolsRunning: 0,
  lastError: null,
});

const MAX_TRANSCRIPT = 60;

function upsertItem(transcript, id, role, patch) {
  const index = transcript.findIndex((item) => item.id === id);
  if (index === -1) {
    const next = [...transcript, { id, role, text: '', final: false, ...patch }];
    return next.length > MAX_TRANSCRIPT ? next.slice(-MAX_TRANSCRIPT) : next;
  }
  const next = transcript.slice();
  next[index] = { ...next[index], ...patch };
  return next;
}

function settle(state) {
  if (state.toolsRunning > 0) return 'working';
  if (state.speaking) return 'speaking';
  return 'listening';
}

/**
 * @param {typeof INITIAL_CONVERSATION} state
 * @param {{type:string}} event  a Realtime server event, or a local one (local.*)
 */
export function reduceConversation(state, event) {
  switch (event?.type) {
    case 'input_audio_buffer.speech_started':
      return {
        ...state,
        activity: 'user_speaking',
        transcript: event.item_id ? upsertItem(state.transcript, event.item_id, 'user', {}) : state.transcript,
      };

    case 'input_audio_buffer.speech_stopped':
      return { ...state, activity: 'thinking' };

    case 'conversation.item.input_audio_transcription.delta': {
      const current = state.transcript.find((item) => item.id === event.item_id);
      return {
        ...state,
        transcript: upsertItem(state.transcript, event.item_id, 'user', { text: `${current?.text || ''}${event.delta || ''}` }),
      };
    }

    case 'conversation.item.input_audio_transcription.completed': {
      const text = String(event.transcript || '').trim();
      if (!text) return { ...state, transcript: state.transcript.filter((item) => item.id !== event.item_id) };
      return { ...state, transcript: upsertItem(state.transcript, event.item_id, 'user', { text, final: true }) };
    }

    case 'conversation.item.input_audio_transcription.failed':
      return { ...state, transcript: state.transcript.filter((item) => !(item.id === event.item_id && !item.text)) };

    case 'response.created':
      return { ...state, activity: state.speaking ? 'speaking' : (state.toolsRunning ? 'working' : 'thinking') };

    case 'response.output_audio_transcript.delta':
    case 'response.output_text.delta': {
      const current = state.transcript.find((item) => item.id === event.item_id);
      return {
        ...state,
        transcript: upsertItem(state.transcript, event.item_id, 'assistant', { text: `${current?.text || ''}${event.delta || ''}` }),
      };
    }

    case 'response.output_audio_transcript.done':
    case 'response.output_text.done': {
      const text = String(event.transcript ?? event.text ?? '').trim();
      const current = state.transcript.find((item) => item.id === event.item_id);
      return {
        ...state,
        transcript: upsertItem(state.transcript, event.item_id, 'assistant', { text: text || current?.text || '', final: true }),
      };
    }

    case 'output_audio_buffer.started':
      return { ...state, speaking: true, activity: 'speaking' };

    case 'output_audio_buffer.stopped':
    case 'output_audio_buffer.cleared': {
      const next = { ...state, speaking: false };
      return { ...next, activity: settle(next) };
    }

    case 'response.done': {
      const status = event.response?.status;
      const next = { ...state, lastError: status === 'failed' ? (event.response?.status_details?.error?.message || 'response_failed') : state.lastError };
      return { ...next, activity: settle(next) };
    }

    case 'local.tool_started': {
      const next = { ...state, toolsRunning: state.toolsRunning + 1 };
      return { ...next, activity: 'working' };
    }

    case 'local.tool_finished': {
      const next = { ...state, toolsRunning: Math.max(0, state.toolsRunning - 1) };
      return { ...next, activity: next.toolsRunning ? 'working' : 'thinking' };
    }

    case 'local.user_text':
      return {
        ...state,
        activity: 'thinking',
        transcript: upsertItem(state.transcript, event.id, 'user', { text: event.text, final: true }),
      };

    case 'error':
      return { ...state, lastError: event.error?.message || 'error' };

    case 'local.reset':
      return INITIAL_CONVERSATION;

    default:
      return state;
  }
}

/** Function calls a finished response asked for. */
export function functionCallsOf(event) {
  if (event?.type !== 'response.done') return [];
  const output = event.response?.output || [];
  return output
    .filter((item) => item?.type === 'function_call' && item.call_id && item.name)
    .map((item) => {
      let args = {};
      try { args = item.arguments ? JSON.parse(item.arguments) : {}; } catch { args = {}; }
      return { callId: item.call_id, name: item.name, args };
    });
}

/** Root-mean-square level (0..1, gently boosted) of an analyser's time-domain data. */
export function levelFromSamples(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = (samples[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1, Math.pow(rms * 3.2, 0.8));
}
