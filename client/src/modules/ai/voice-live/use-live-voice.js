'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { liveVoiceService } from './live-voice-service';
import {
  INITIAL_CONVERSATION,
  functionCallsOf,
  levelFromSamples,
  reduceConversation,
} from './realtime-events';

/**
 * One live voice conversation with the Updata assistant over WebRTC.
 *
 * status: 'idle' | 'connecting' | 'live' | 'ended' | 'error'
 *
 * Audio goes browser ↔ OpenAI directly (low latency, echo cancellation,
 * server-side turn detection and barge-in). Tool calls come back over the
 * data channel; client tools (open_page, end_conversation) run here, every
 * other tool runs on our server under the person's own permissions.
 */
const CLIENT_TOOLS = new Set(['open_page', 'end_conversation']);

function errorCodeOf(err) {
  if (!err) return 'unknown';
  if (err.name === 'NotAllowedError' || err.name === 'SecurityError') return 'mic_denied';
  if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'no_mic';
  if (err.name === 'NotReadableError') return 'mic_busy';
  if (err.code === 'VOICE_AGENT_UNAVAILABLE' || err.statusCode === 503) return 'unavailable';
  if (err.code === 'AI_SESSIONS_FORBIDDEN' || err.statusCode === 403) return 'forbidden';
  if (err.status && err.status >= 400) return 'connect_failed';
  return err.code || 'connect_failed';
}

export function useLiveVoice({ onOpenPage, onEnded } = {}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [conversation, dispatch] = useReducer(reduceConversation, INITIAL_CONVERSATION);
  const [actions, setActions] = useState([]);
  const [session, setSession] = useState(null);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioElRef = useRef(null);
  const audioCtxRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const outAnalyserRef = useRef(null);
  const bufRef = useRef(null);
  const sessionRef = useRef(null);
  const statusRef = useRef('idle');
  const endRequestedRef = useRef(false);
  const endTimerRef = useRef(null);
  const speakingRef = useRef(false);
  const callbacksRef = useRef({ onOpenPage, onEnded });
  // Each start() gets a token; a hang-up while connecting invalidates it so a
  // late getUserMedia/session response cannot resurrect the call.
  const attemptRef = useRef(0);

  useEffect(() => { callbacksRef.current = { onOpenPage, onEnded }; }, [onOpenPage, onEnded]);
  useEffect(() => { statusRef.current = status; }, [status]);

  const send = useCallback((event) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') dc.send(JSON.stringify(event));
  }, []);

  // ── teardown ─────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    clearTimeout(endTimerRef.current);
    try { dcRef.current?.close(); } catch { /* already closed */ }
    try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch { /* ignore */ }
    try { pcRef.current?.close(); } catch { /* ignore */ }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
    }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    pcRef.current = null;
    dcRef.current = null;
    micStreamRef.current = null;
    audioElRef.current = null;
    audioCtxRef.current = null;
    micAnalyserRef.current = null;
    outAnalyserRef.current = null;
  }, []);

  const end = useCallback((reason = 'user') => {
    const threadId = sessionRef.current?.threadId || null;
    const hadSession = Boolean(pcRef.current);
    attemptRef.current += 1;
    teardown();
    endRequestedRef.current = false;
    speakingRef.current = false;
    const next = statusRef.current === 'error' && reason !== 'user' ? 'error' : 'ended';
    statusRef.current = next;
    setStatus(next);
    callbacksRef.current.onEnded?.({ threadId, reason, hadSession });
  }, [teardown]);

  // ── levels for the orb (read every animation frame, never re-render) ──────
  const getLevels = useCallback(() => {
    const read = (analyser) => {
      if (!analyser) return 0;
      if (!bufRef.current || bufRef.current.length !== analyser.fftSize) bufRef.current = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(bufRef.current);
      return levelFromSamples(bufRef.current);
    };
    return { input: read(micAnalyserRef.current), output: read(outAnalyserRef.current) };
  }, []);

  // ── tools ────────────────────────────────────────────────────────────────
  const runClientTool = useCallback((name, args) => {
    if (name === 'open_page') {
      const path = sessionRef.current?.pages?.[args.page];
      if (!path) return { status: 'failed', message: 'Unknown page.' };
      callbacksRef.current.onOpenPage?.(path, args.page);
      return { status: 'completed', opened: args.page };
    }
    if (name === 'end_conversation') {
      endRequestedRef.current = true;
      // Let the goodbye finish playing; hang up when the audio stops, or soon.
      clearTimeout(endTimerRef.current);
      endTimerRef.current = setTimeout(() => end('assistant'), speakingRef.current ? 9000 : 1500);
      return { status: 'completed' };
    }
    return { status: 'failed', message: 'Unknown client tool.' };
  }, [end]);

  const runTools = useCallback(async (calls) => {
    const current = sessionRef.current;
    if (!current) return;
    let needsResponse = false;

    await Promise.all(calls.map(async (call) => {
      dispatch({ type: 'local.tool_started' });
      setActions((list) => [...list, { id: call.callId, name: call.name, args: call.args, status: 'running', at: Date.now() }]);
      let result;
      let display = null;
      try {
        if (CLIENT_TOOLS.has(call.name)) {
          result = runClientTool(call.name, call.args);
        } else {
          const data = await liveVoiceService.runTool({
            name: call.name,
            arguments: call.args,
            threadId: current.threadId,
            currentPage: typeof window !== 'undefined' ? window.location.pathname : null,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
          result = data?.result ?? { status: 'failed', message: 'No result.' };
          display = data?.display ?? null;
        }
      } catch (err) {
        result = { status: 'failed', message: err?.message || 'The tool failed.' };
      }
      dispatch({ type: 'local.tool_finished' });
      setActions((list) => list.map((a) => (a.id === call.callId
        ? { ...a, status: result?.status === 'failed' ? 'failed' : (result?.status || 'completed'), result, display }
        : a)));

      if (display?.kind === 'agent_run' && current.threadId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentThread(current.threadId) });
        queryClient.invalidateQueries({ queryKey: ['ai', 'agentRuns'] });
      }

      send({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: call.callId, output: JSON.stringify(result) },
      });
      if (call.name !== 'end_conversation') needsResponse = true;
    }));

    // One response after all outputs are in, so the model speaks once about all of them.
    if (needsResponse && dcRef.current?.readyState === 'open' && !endRequestedRef.current) {
      send({ type: 'response.create' });
    }
  }, [queryClient, runClientTool, send]);

  const handleServerEvent = useCallback((event) => {
    dispatch(event);
    switch (event.type) {
      case 'output_audio_buffer.started':
        speakingRef.current = true;
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        speakingRef.current = false;
        if (endRequestedRef.current) {
          clearTimeout(endTimerRef.current);
          endTimerRef.current = setTimeout(() => end('assistant'), 400);
        }
        break;
      case 'response.done': {
        const calls = functionCallsOf(event);
        if (calls.length) runTools(calls);
        break;
      }
      case 'error':
        // Non-fatal protocol errors (e.g. cancelling a finished response) are expected.
        if (event.error?.code === 'session_expired') {
          setError('session_expired');
          statusRef.current = 'error';
          end('expired');
        }
        break;
      default:
        break;
    }
  }, [end, runTools]);

  // ── connect ──────────────────────────────────────────────────────────────
  const start = useCallback(async ({ voice, locale, threadId } = {}) => {
    if (pcRef.current || statusRef.current === 'connecting') return;
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    const stale = () => attempt !== attemptRef.current;
    setStatus('connecting');
    statusRef.current = 'connecting';
    setError(null);
    setActions([]);
    setMuted(false);
    dispatch({ type: 'local.reset' });

    try {
      if (!navigator?.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        const unsupported = new Error('unsupported');
        unsupported.code = 'unsupported';
        throw unsupported;
      }
      // Microphone first: a refusal should not cost a session.
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      if (stale()) { mic.getTracks().forEach((t) => t.stop()); return; }
      micStreamRef.current = mic;

      const created = await liveVoiceService.createSession({
        voice,
        locale,
        threadId: threadId || undefined,
        currentPage: window.location.pathname,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (stale()) { mic.getTracks().forEach((t) => t.stop()); return; }
      sessionRef.current = created;
      setSession(created);

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const micAnalyser = ctx.createAnalyser();
        micAnalyser.fftSize = 512;
        micAnalyser.smoothingTimeConstant = 0.6;
        ctx.createMediaStreamSource(mic).connect(micAnalyser);
        micAnalyserRef.current = micAnalyser;
        ctx.resume?.().catch(() => {});
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', '');
      audioEl.dataset.testid = 'live-voice-audio';
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        const [stream] = e.streams;
        audioEl.srcObject = stream;
        audioEl.play?.().catch(() => {});
        const ctx = audioCtxRef.current;
        if (ctx && stream) {
          try {
            const outAnalyser = ctx.createAnalyser();
            outAnalyser.fftSize = 512;
            outAnalyser.smoothingTimeConstant = 0.5;
            ctx.createMediaStreamSource(stream).connect(outAnalyser);
            outAnalyserRef.current = outAnalyser;
          } catch { /* the orb just won't follow the voice */ }
        }
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(pc.connectionState) && statusRef.current === 'live') {
          setError('connection_lost');
          statusRef.current = 'error';
          end('connection_lost');
        }
      };

      mic.getAudioTracks().forEach((track) => pc.addTrack(track, mic));

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (msg) => {
        let event;
        try { event = JSON.parse(msg.data); } catch { return; }
        handleServerEvent(event);
      };
      dc.onopen = () => {
        setStatus('live');
        statusRef.current = 'live';
        // A short greeting proves the line works before the person says anything.
        send({
          type: 'response.create',
          response: { instructions: 'Greet the person by first name in one short sentence in the configured language and ask what you can do for them. Do not call tools.' },
        });
      };
      dc.onclose = () => {
        if (statusRef.current === 'live') {
          setError('connection_lost');
          statusRef.current = 'error';
          end('connection_lost');
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await liveVoiceService.exchangeSdp({ sdp: offer.sdp, clientSecret: created.clientSecret });
      if (stale()) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    } catch (err) {
      if (stale()) return;
      teardown();
      setError(errorCodeOf(err));
      setStatus('error');
      statusRef.current = 'error';
    }
  }, [end, handleServerEvent, send, teardown]);

  // ── controls ─────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      micStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
      return next;
    });
  }, []);

  /** Stop the assistant mid-sentence (barge-in by button). */
  const interrupt = useCallback(() => {
    send({ type: 'response.cancel' });
    send({ type: 'output_audio_buffer.clear' });
  }, [send]);

  /** Type instead of speaking, without leaving the conversation. */
  const sendText = useCallback((text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || statusRef.current !== 'live') return;
    const id = `local-${Date.now()}`;
    dispatch({ type: 'local.user_text', id, text: trimmed });
    if (speakingRef.current) interrupt();
    send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: trimmed }] } });
    send({ type: 'response.create' });
  }, [interrupt, send]);

  useEffect(() => () => teardown(), [teardown]);

  return {
    status,
    error,
    muted,
    activity: conversation.activity,
    transcript: conversation.transcript,
    actions,
    session,
    start,
    end,
    toggleMute,
    interrupt,
    sendText,
    getLevels,
  };
}
