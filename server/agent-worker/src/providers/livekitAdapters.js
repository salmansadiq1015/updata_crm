import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as google from '@livekit/agents-plugin-google';
import { ActivityHandling, Behavior } from '@google/genai';
import { openVoiceCredential } from '../../../shared/voiceCredentials.js';
import { transcription, turnDetection } from '../transcription.js';
import { ownedGoogleSession, closeOwnedGoogleSockets } from './googleSocketOwnership.js';

/** AgentSession consumes the same verified SDK session, never a second socket. */
class ConnectedModel extends llm.RealtimeModel {
  constructor(adapter) { super(adapter.sdk.capabilities); this.adapter = adapter; }
  get model() { return this.adapter.model; }
  get provider() { return this.adapter.provider; }
  session() { return this.adapter.raw; }
  close() { return this.adapter.terminateSession(); }
}

export function providerErrorCode(error) {
  if (typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code)) return error.code;
  const detail = String(error?.error?.message || error?.message || '');
  if (/key.*missing|not set|credential/i.test(detail)) return 'CREDENTIAL_UNAVAILABLE';
  if (/429|quota|rate.?limit|resource_exhausted/i.test(detail)) return 'RATE_LIMIT_OR_QUOTA';
  if (/401|403|permission|unauthor|api.key|authentication/i.test(detail)) return 'AUTHENTICATION_FAILED';
  if (/model|404|not.found/i.test(detail)) return 'MODEL_UNAVAILABLE';
  if (/timeout/i.test(detail)) return 'CONNECTION_TIMEOUT';
  return 'PROVIDER_CONNECTION_FAILED';
}

export class LiveKitVoiceAdapter extends EventEmitter {
  constructor({ provider, model, config, instructions, tools, chatCtx, callConfig = {}, meta = {}, isPstn = false, maxOutputTokens = 1024, env = process.env, transcriptionContext }) {
    super();
    Object.assign(this, { provider, model, config, instructions, tools, chatCtx, callConfig, meta, isPstn, maxOutputTokens, env, transcriptionContext });
    this.closed = false;
    this.usage = null;
  }
  async initializeSession() {
    if (this.sdk) return;
    const sealed = this.config.sealedCredentials?.[this.provider];
    let apiKey;
    try { apiKey = sealed ? openVoiceCredential(sealed, this.provider, this.env) : this.provider === 'gemini' ? this.env.GEMINI_API_KEY || this.env.GOOGLE_API_KEY : this.env.OPENAI_API_KEY; }
    catch { throw Object.assign(new Error('Worker cannot decrypt provider credential'), { code: 'CREDENTIAL_UNAVAILABLE' }); }
    if (!apiKey) throw Object.assign(new Error('Provider key missing'), { code: 'CREDENTIAL_UNAVAILABLE' });
    const allowBargeIn = this.callConfig.allowBargeIn !== false;
    // Keep SDK retries/reconnects within one provider; the manager independently
    // bounds establishment and never re-enters selection for an active call.
    const connOptions = { maxRetry: 3, timeoutMs: this.config.connectionTimeoutMs, retryIntervalMs: 1000 };
    this.sdk = this.provider === 'gemini'
      ? new google.realtime.RealtimeModel({
        model: this.model, apiKey, voice: this.config.geminiVoice, instructions: this.instructions,
        vertexai: false, inputAudioTranscription: {}, outputAudioTranscription: {},
        maxOutputTokens: this.maxOutputTokens, connOptions,
        // CRM validation must finish before speech resumes. No provider grounding tools.
        toolBehavior: Behavior.BLOCKING,
        realtimeInputConfig: { automaticActivityDetection: { disabled: false, prefixPaddingMs: 500, silenceDurationMs: 1000 }, activityHandling: allowBargeIn ? ActivityHandling.START_OF_ACTIVITY_INTERRUPTS : ActivityHandling.NO_INTERRUPTION },
        contextWindowCompression: { slidingWindow: {} },
      })
      : new openai.realtime.RealtimeModel({
        model: this.model, apiKey, voice: this.meta.voice || this.callConfig.voice || this.env.OPENAI_REALTIME_VOICE || 'alloy',
        turnDetection: turnDetection(this.env, { allowBargeIn }), maxResponseOutputTokens: this.maxOutputTokens,
        inputAudioTranscription: transcription(this.meta.language || this.callConfig.language, this.env, this.transcriptionContext),
        ...(this.isPstn ? {} : { inputAudioNoiseReduction: { type: 'near_field' } }), connOptions,
      });
    this.livekitModel = new ConnectedModel(this);
  }
  async connect(timeoutMs = 15000) {
    this.raw = this.provider === 'gemini' ? ownedGoogleSession(this, () => this.sdk.session()) : this.sdk.session();
    // OpenAI 1.9.2 leaves its queue reader asleep and clears queued events during
    // close(). Wake it AFTER that clearing so its sender exits and closes the WS.
    const close = this.raw.close.bind(this.raw); let closing;
    this.raw.close = () => {
      if (!closing) {
        closing = (async () => {
          await close();
          if (this.provider === 'openai') await this.raw.clearAudio();
        })();
      }
      return closing;
    };
    // Always retain an error listener; EventEmitter's special error event must not throw.
    this.raw.on('error', error => {
      const normalized = { provider: this.provider, code: providerErrorCode(error), recoverable: error?.recoverable };
      if (error?.recoverable === false) this.fatalError = normalized;
      this.emit('provider_error', normalized);
    });
    this.raw.on('metrics_collected', metrics => { this.usage = metrics; this.emit('usage', metrics); });
    this.raw.on('input_audio_transcription_completed', event => this.emit('transcription', { ...event, provider: this.provider }));
    this.raw.on('generation_created', event => this.emit('generation', event));
    const ready = new Promise((resolve, reject) => {
      let poll;
      const cleanup = () => { clearTimeout(timer); clearInterval(poll); this.raw.off('error', onError); this.raw.off('openai_server_event_received', onOpenAI); };
      const finish = error => { cleanup(); error ? reject(Object.assign(new Error('Provider setup failed'), { code: error.code || providerErrorCode(error) })) : resolve(); };
      const onError = error => { if (error?.recoverable === false) finish(error); };
      const onOpenAI = event => { if (event.type === 'session.updated') finish(); };
      const timer = setTimeout(() => finish({ code: 'CONNECTION_TIMEOUT' }), timeoutMs);
      this.raw.on('error', onError);
      if (this.provider === 'openai') this.raw.on('openai_server_event_received', onOpenAI);
      else {
        // Compatibility boundary pinned to Google plugin 1.9.2: activeSession is
        // assigned only AFTER official SDK live.connect resolves setupComplete.
        // No public readiness event exists. Ignore a socket awaiting tool restart.
        poll = setInterval(() => { if (this.raw.activeSession && !this.raw.sessionShouldClose?.isSet) finish(); }, 25);
      }
    });
    // Install full tools/context before admitting audio. Errors also settle ready.
    try {
      await this.raw.updateInstructions(this.instructions);
      await this.raw.updateTools(new llm.ToolContext(this.tools));
      await this.raw.updateChatCtx(this.chatCtx);
    } catch (error) { await this.terminateSession(); throw error; }
    await ready;
    this.emit('connected', { provider: this.provider, model: this.model });
  }
  sendAudio(frame) { this.raw.pushAudio(frame); }
  receiveAudio(handler) { this.on('generation', handler); return () => this.off('generation', handler); }
  async sendText(text) { const ctx = this.raw.chatCtx.copy(); ctx.addMessage({ role: 'user', content: text }); await this.raw.updateChatCtx(ctx); return this.raw.generateReply(); }
  updateInstructions(text) { return this.raw.updateInstructions(text); }
  async executeTool(name, args) { const tool = this.tools[name]; if (!tool) throw new Error('Unknown CRM tool'); return tool.execute(args); }
  getUsage() { return this.usage; }
  handleInterruption() { return this.raw.interrupt(); }
  async terminateSession() {
    if (this.closed) return;
    this.closed = true;
    await this.raw?.close();
    if (this.provider === 'gemini') await closeOwnedGoogleSockets(this);
    await this.sdk?.close();
    this.emit('terminated', { provider: this.provider, model: this.model });
  }
}
