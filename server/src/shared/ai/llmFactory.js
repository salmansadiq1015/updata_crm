/**
 * Single place where LLM clients are built.
 *
 * Every AI feature goes through here so the provider can be changed in one
 * file — which is what makes the pending nDSG data-residency decision cheap:
 * pointing at Azure OpenAI (Switzerland), a Swiss gateway or any other
 * OpenAI-compatible endpoint is a config change, not a refactor.
 *
 * Set OPENAI_BASE_URL to redirect both the chat models and the raw client
 * (Whisper, vision) at an alternative OpenAI-compatible endpoint.
 */
import config from '../../config/index.js';
import { AppError } from '../errors/AppError.js';

const NOT_CONFIGURED_MESSAGE =
  'Der KI-Assistent ist nicht konfiguriert (OPENAI_API_KEY fehlt). Bitte den Administrator kontaktieren.';

export function isAiConfigured() {
  return Boolean(config.ai.apiKey);
}

export function assertAiConfigured() {
  if (!isAiConfigured()) {
    throw new AppError(NOT_CONFIGURED_MESSAGE, 503, 'AI_NOT_CONFIGURED');
  }
}

/**
 * LangChain chat model, used by the agent planner and the workflows.
 * @param {{ temperature?: number, model?: string }} [options]
 */
export async function createChatModel({ temperature = 0, model } = {}) {
  assertAiConfigured();
  const { ChatOpenAI } = await import('@langchain/openai');
  return new ChatOpenAI({
    apiKey: config.ai.apiKey,
    model: model || config.ai.model || 'gpt-4o',
    temperature,
    ...(config.ai.baseUrl ? { configuration: { baseURL: config.ai.baseUrl } } : {}),
  });
}

/**
 * Raw OpenAI SDK client, used where LangChain has no equivalent
 * (Whisper transcription, vision extraction, JSON-mode completions).
 */
export async function createOpenAiClient() {
  assertAiConfigured();
  const { default: OpenAI } = await import('openai');
  return new OpenAI({
    apiKey: config.ai.apiKey,
    ...(config.ai.baseUrl ? { baseURL: config.ai.baseUrl } : {}),
  });
}
