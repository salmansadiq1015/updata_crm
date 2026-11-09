/**
 * Live voice assistant: mints a short-lived OpenAI Realtime credential for the
 * browser (which then talks to OpenAI over WebRTC — audio never passes through
 * this server) and runs the server-side tools the model calls.
 *
 * The long-lived API key never leaves the server; the browser only ever holds
 * an ephemeral `ek_…` secret scoped to one session configuration, including
 * the instructions and the tool list decided here.
 */
import { randomUUID } from 'crypto';
import config from '../../../config/index.js';
import { AppError } from '../../../shared/errors/AppError.js';
import logger from '../../../shared/logger/index.js';
import auditService from '../../auth/audit.service.js';
import { createOpenAiClient } from '../../../shared/ai/llmFactory.js';
import { buildVoiceAgentInstructions, REALTIME_VOICES, DEFAULT_VOICE } from './voiceAgent.instructions.js';
import { toolDeclarations, executeVoiceTool, VOICE_PAGES, CLIENT_TOOLS } from './voiceAgent.tools.js';

const SESSION_TTL_SECONDS = 600; // the secret must be used to connect within this window
const TRANSCRIBE_MODEL = process.env.VOICE_AGENT_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';

export function realtimeModel() {
  return process.env.VOICE_AGENT_MODEL || config.ai?.realtimeModel || process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
}

export function isVoiceAgentAvailable() {
  // A non-OpenAI base URL (Swiss gateway, Azure…) has no Realtime endpoint.
  return Boolean(config.ai?.apiKey) && !config.ai?.baseUrl;
}

function displayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '';
}

class VoiceAgentService {
  status() {
    return {
      available: isVoiceAgentAvailable(),
      model: realtimeModel(),
      voices: REALTIME_VOICES,
      defaultVoice: DEFAULT_VOICE,
    };
  }

  buildSessionConfig({ user, voice, locale, currentPage, timeZone }) {
    return {
      type: 'realtime',
      model: realtimeModel(),
      output_modalities: ['audio'],
      instructions: buildVoiceAgentInstructions({
        userName: displayName(user),
        role: user?.role?.name,
        locale,
        currentPage,
        timeZone: timeZone || 'Europe/Zurich',
        pages: Object.keys(VOICE_PAGES),
      }),
      audio: {
        input: {
          noise_reduction: { type: 'near_field' },
          transcription: { model: TRANSCRIBE_MODEL },
          turn_detection: { type: 'semantic_vad', eagerness: 'auto', create_response: true, interrupt_response: true },
        },
        output: { voice: REALTIME_VOICES.includes(voice) ? voice : DEFAULT_VOICE },
      },
      tools: toolDeclarations(),
      tool_choice: 'auto',
    };
  }

  async createSession({ user, voice, locale, currentPage, threadId, timeZone, meta = {} }) {
    if (!isVoiceAgentAvailable()) {
      throw new AppError('Live voice is not available: the OpenAI Realtime API is not configured on this server.', 503, 'VOICE_AGENT_UNAVAILABLE');
    }
    const session = this.buildSessionConfig({ user, voice, locale, currentPage, timeZone });
    let secret;
    try {
      const client = await createOpenAiClient();
      secret = await client.realtime.clientSecrets.create({
        expires_after: { anchor: 'created_at', seconds: SESSION_TTL_SECONDS },
        session,
      });
    } catch (err) {
      logger.error('Realtime client secret could not be created', { module: 'ai-voice-agent', action: 'createSession', error: err.message, status: err.status });
      throw new AppError('The voice service could not be reached. Please try again.', 502, 'VOICE_AGENT_UPSTREAM');
    }

    const resolvedThread = threadId || randomUUID();
    auditService.logEvent({
      eventType: 'ai.voice_agent.session.started',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { model: session.model, voice: session.audio.output.voice, threadId: resolvedThread },
      module: 'ai',
    });

    return {
      clientSecret: secret.value,
      expiresAt: secret.expires_at,
      model: session.model,
      voice: session.audio.output.voice,
      threadId: resolvedThread,
      pages: VOICE_PAGES,
      clientTools: CLIENT_TOOLS,
    };
  }

  async runTool({ name, args, user, permissions, threadId, currentPage, timeZone, meta = {} }) {
    const started = Date.now();
    try {
      const out = await executeVoiceTool(name, args, {
        user,
        permissions,
        threadId,
        timeZone,
        requestContext: currentPage ? { path: currentPage } : {},
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      logger.info('Voice tool executed', { module: 'ai-voice-agent', tool: name, durationMs: Date.now() - started, status: out?.result?.status });
      return out;
    } catch (err) {
      if (err instanceof AppError && err.code === 'VOICE_TOOL_UNKNOWN') throw err;
      logger.warn('Voice tool failed', { module: 'ai-voice-agent', tool: name, error: err.message });
      // The model must hear a failure, not a crash: it tells the person.
      const statusCode = err.statusCode || err.status;
      return {
        result: {
          status: 'failed',
          code: err.code || null,
          message: statusCode && statusCode < 500 ? err.message : 'The system could not complete this right now.',
        },
        display: null,
      };
    }
  }
}

export default new VoiceAgentService();
