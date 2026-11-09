/**
 * Bridge between the live voice model and the existing ERP agent pipeline.
 *
 * A voice request is dispatched exactly like a typed chat message — same
 * planner, governance gate (risk approval), capability RBAC, audit trail and
 * thread — and then awaited, so the voice model can speak the outcome. The
 * runs land in the voice conversation's thread, which is why the chat history
 * shows what was done by voice.
 */
import agentService from '../agent/agent.service.js';
import agentRunRepository from '../agent/agentRun.repository.js';
import { createChatModel } from '../../../shared/ai/llmFactory.js';
import logger from '../../../shared/logger/index.js';

const TRANSLATE_TIMEOUT_MS = 4000;
const TRANSLATE_MODEL = process.env.VOICE_AGENT_TRANSLATE_MODEL || 'gpt-4o-mini';
let translator = null;

/**
 * The agent answers in the office's German. A voice conversation in another
 * language must hear its own language — a model reading German tool output
 * drifts into German however it is instructed — so the spoken parts of the
 * result are translated first. Any failure keeps the original text.
 */
export async function translateTexts(texts, language, { invoke } = {}) {
  const lang = String(language || '').trim().toLowerCase();
  const items = texts.filter((t) => typeof t === 'string' && t.trim());
  if (!items.length || !lang || /^(de|ger|deutsch|german)/.test(lang)) return texts;
  try {
    const call = invoke || (async (messages) => {
      if (!translator) translator = await createChatModel({ temperature: 0, model: TRANSLATE_MODEL });
      return translator.invoke(messages);
    });
    const response = await Promise.race([
      call([
        { role: 'system', content: `Translate each string of the JSON array into the language "${lang}". Keep names, record numbers, dates, times, amounts and line breaks exactly. Reply with a JSON array of strings only, same length and order.` },
        { role: 'user', content: JSON.stringify(items) },
      ]),
      new Promise((_, reject) => { setTimeout(() => reject(new Error('translate timeout')), TRANSLATE_TIMEOUT_MS); }),
    ]);
    const parsed = JSON.parse(String(response.content).replace(/```json|```/g, '').trim());
    if (!Array.isArray(parsed) || parsed.length !== items.length) return texts;
    let i = 0;
    return texts.map((t) => (typeof t === 'string' && t.trim() ? String(parsed[i++]) : t));
  } catch (err) {
    logger.warn('Voice result translation skipped', { module: 'ai-voice-agent', language: lang, error: err.message });
    return texts;
  }
}

/** Translates the spoken fields of a model summary in place (message, questions). */
export async function localizeSummary(summary, language, options) {
  if (!summary || !language) return summary;
  const questions = Array.isArray(summary.followUpQuestions) ? summary.followUpQuestions : [];
  const fields = [summary.message, summary.effect, summary.action && summary.status === 'awaiting_confirmation' ? summary.action : null, ...questions];
  const out = await translateTexts(fields, language, options);
  const next = { ...summary };
  if (summary.message) next.message = out[0];
  if (summary.effect) next.effect = out[1];
  if (summary.status === 'awaiting_confirmation' && summary.action) next.action = out[2];
  if (questions.length) next.followUpQuestions = out.slice(3);
  return next;
}

const SETTLED = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_CONFIRMATION']);
const POLL_MS = 250;
export const RUN_WAIT_TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Polls one run until it settles (or the timeout passes) and returns it.
 * A run still working after the timeout is returned as-is; the caller tells
 * the model it is still running rather than inventing an outcome.
 */
export async function waitForRun(agentRunId, { timeoutMs = RUN_WAIT_TIMEOUT_MS, repo = agentRunRepository } = {}) {
  const deadline = Date.now() + timeoutMs;
  let run = await repo.findById(agentRunId);
  while (run && !SETTLED.has(run.status) && Date.now() < deadline) {
    await sleep(POLL_MS);
    run = await repo.findById(agentRunId);
  }
  return run;
}

const MODEL_TEXT_LIMIT = 3500;

/** Drops what the model must never read aloud or does not need. */
function stripForModel(value, depth = 0) {
  if (value == null || depth > 5) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map((v) => stripForModel(v, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 1200) : value;
  if (value instanceof Date) return value.toISOString();
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (['resolvedContext', 'originalInput', 'toolInput', '__v', 'steps', 'provenance'].includes(key)) continue;
    out[key] = stripForModel(v, depth + 1);
  }
  return out;
}

// The agent writes for the (German-speaking) office; the voice model must not
// take that as the conversation language.
const LANGUAGE_NOTE = 'Texts in this result are internal system wording (often German). Do not switch language because of them: say the outcome in the language the person is speaking.';

/** What the voice model is told about one settled run. */
export function summarizeRunForModel(run) {
  const summary = summarizeRun(run);
  return summary.message || summary.followUpQuestions ? { ...summary, language_note: LANGUAGE_NOTE } : summary;
}

function summarizeRun(run) {
  if (!run) return { status: 'failed', message: 'The request could not be found.' };
  const output = run.output || {};
  const runId = String(run._id);

  if (run.status === 'AWAITING_CONFIRMATION') {
    const c = output.confirmation || {};
    return {
      status: 'awaiting_confirmation',
      run_id: runId,
      action: c.label || output.action,
      effect: c.effect || null,
      proposal: stripForModel(c.proposal || null),
      message: output.message || null,
      instruction: 'Tell the person briefly what will happen and ask for a clear yes or no. Then call confirm_pending_action with this run_id.',
    };
  }
  if (run.status === 'FAILED') {
    return {
      status: 'failed',
      message: run.error?.message || output.message || 'The request failed.',
      code: run.error?.code || null,
    };
  }
  if (run.status === 'CANCELLED') return { status: 'cancelled', message: 'The action was cancelled; nothing was changed.' };
  if (!SETTLED.has(run.status)) {
    return { status: 'still_running', run_id: runId, message: 'The request is still being processed; the result will appear in the chat.' };
  }

  const status = output.status === 'needs_follow_up' ? 'needs_follow_up' : (output.status === 'failed' ? 'failed' : 'completed');
  const compact = stripForModel({
    status,
    action: output.action || null,
    message: output.message || null,
    followUpQuestions: output.followUpQuestions || undefined,
    missingFields: output.missingFields || undefined,
    candidates: output.candidates || undefined,
    record: output.record || undefined,
    records: output.records || undefined,
    error: output.error || undefined,
  });
  let text = JSON.stringify(compact);
  if (text.length > MODEL_TEXT_LIMIT) {
    delete compact.records;
    compact.records_note = `${(output.records || []).length} records found; the message summarises them.`;
    text = JSON.stringify(compact);
    if (text.length > MODEL_TEXT_LIMIT) compact.message = String(compact.message || '').slice(0, 1500);
  }
  return compact;
}

/** What the screen shows for one run: the full output, for the existing record cards. */
export function displayForRun(run) {
  if (!run) return null;
  return {
    kind: 'agent_run',
    runId: String(run._id),
    threadId: run.threadId || null,
    status: run.status,
    output: run.output || null,
    error: run.error || null,
  };
}

export async function runCrmRequest({ request, continuesPrevious, replyLanguage, user, permissions, threadId, context, meta = {} }) {
  const dispatched = await agentService.run(request, String(user._id), permissions, {
    ...meta,
    threadId,
    context: context || {},
    ignoreFollowUp: !continuesPrevious,
  });
  const run = await waitForRun(dispatched.agentRunId);
  return { result: await localizeSummary(summarizeRunForModel(run), replyLanguage), display: displayForRun(run) };
}

export async function confirmPendingRun({ runId, approve, replyLanguage, user }) {
  const userId = String(user._id);
  await agentService.confirmRun(runId, userId, Boolean(approve), {});
  if (!approve) {
    return { result: { status: 'cancelled', message: 'Cancelled. Nothing was changed.' }, display: null };
  }
  // The run is AWAITING_CONFIRMATION until the resume job picks it up; wait
  // for it to leave that state before polling for the outcome.
  const deadline = Date.now() + 5000;
  let run = await agentRunRepository.findById(runId);
  while (run?.status === 'AWAITING_CONFIRMATION' && Date.now() < deadline) {
    await sleep(POLL_MS);
    run = await agentRunRepository.findById(runId);
  }
  run = await waitForRun(runId);
  return { result: await localizeSummary(summarizeRunForModel(run), replyLanguage), display: displayForRun(run) };
}
