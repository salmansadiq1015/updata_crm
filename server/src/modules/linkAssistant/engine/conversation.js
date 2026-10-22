/**
 * One turn of a text conversation, channel-agnostic (web link today; the same
 * shape fits SMS and voice adapters). The SERVER decides every state change:
 *
 *   1. deterministic intents (opt-out, human, are-you-human, busy) — never a model;
 *   2. the deterministic question engine (aiCalling questionEngine) says what is open;
 *   3. answers go through interpretReply → the same validator as calls; a model may
 *      only *propose* a value, which is re-validated (it can never write a value the
 *      validator rejects, and it cannot opt someone out or qualify them);
 *   4. every change is applied through the constrained tools (the aiCalling agent
 *      tool functions), so the CallRecord is updated immediately.
 *
 * The result is a reply PLAN: the facts the reply must contain plus a deterministic
 * fallback text. A language model may re-phrase the plan (warmer, varied), but it
 * never sees tools and cannot change any data.
 */
import * as engine from '../../aiCalling/engine/questionEngine.js';
import { validateAnswer } from '../../aiCalling/engine/answerValidation.js';
import { interpretReply } from '../../simSms/engine/replyInterpreter.js';
import { copyFor, displayValue, pickAck, questionText } from './assistantCopy.js';
import { detectIntent } from './intents.js';

const CHOICE_TYPES = new Set(['single_choice', 'enum', 'multiple_choice', 'rating']);

export function inputModeFor(question) {
  switch (question?.type) {
    case 'integer': case 'rating': return 'numeric';
    case 'decimal': case 'currency': return 'decimal';
    case 'phone': return 'tel';
    case 'email': return 'email';
    case 'url': return 'url';
    case 'date': return 'date';
    case 'time': return 'time';
    case 'long_text': case 'address': return 'multiline';
    default: return 'text';
  }
}

function optionLabel(option) {
  return typeof option === 'object' && option ? String(option.label ?? option.value) : String(option);
}
function optionValue(option) {
  return typeof option === 'object' && option ? String(option.value ?? option.label) : String(option);
}

/** Quick-reply buttons for the open question. */
export function quickRepliesFor(question, language) {
  const c = copyFor(language);
  if (!question) return [];
  if (question.type === 'boolean') return [{ label: c.yes.split(',')[0], value: 'yes' }, { label: c.no.split(',')[0], value: 'no' }];
  if (question.type === 'rating' && !(question.options || []).length) {
    const min = Number.isFinite(question.min) ? question.min : 1;
    const max = Number.isFinite(question.max) ? question.max : 5;
    return Array.from({ length: Math.max(0, Math.min(10, max - min + 1)) }, (_, i) => ({ label: String(min + i), value: String(min + i) }));
  }
  if (CHOICE_TYPES.has(question.type)) {
    return (question.options || []).slice(0, 8).map((o) => ({ label: optionLabel(o), value: optionValue(o) }));
  }
  return [];
}

const AFFIRM = /^(y|yes|yeah|yep|ok|okay|sure|start|go|let'?s go|ji|jee|haan|han|bilkul|theek|thik|chalo|shuru|جی|ہاں|ٹھیک|شروع)/i;
const NEGATE = /^(no|nope|nah|not now|later|nahi|nahin|abhi nahi|نہیں|ابھی نہیں)/i;
export const looksLikeQuestion = (text) => /\?\s*$|؟\s*$/.test(String(text).trim())
  || /^(who|what|why|how|where|when|which|can|do|does|is|are|kaun|kya|kyun|kaise|kahan|kab|کون|کیا|کیوں|کیسے|کہاں|کب)\b/i.test(String(text).trim());

/** Very small FAQ matcher used when no model is available (token overlap). */
export function matchFaq(faq, text) {
  const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));
  const asked = words(text);
  if (!asked.size) return null;
  let best = null;
  for (const item of faq || []) {
    const keys = words(item.question);
    const overlap = [...asked].filter((w) => keys.has(w)).length;
    const score = overlap / Math.max(1, Math.min(keys.size, asked.size));
    if (overlap >= 2 && score >= 0.5 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item || null;
}

function answeredSummary(questionnaire, state, language) {
  return engine.eligibleQuestions(questionnaire, state.answers || {})
    .filter((q) => state.answers?.[q.fieldKey])
    .map((q) => ({
      fieldKey: q.fieldKey,
      label: q.label || q.text,
      value: displayValue(state.answers[q.fieldKey].validation === 'valid' ? state.answers[q.fieldKey].normalizedValue : null, language),
    }));
}

/**
 * Describe what the assistant should say next given the engine state.
 * @returns {{ kind, question?, fallback, quickReplies, inputMode, awaiting }}
 */
export function planForState({ questionnaire, state, language, persona, company, prefix = '' }) {
  const c = copyFor(language);
  const action = engine.nextAction(questionnaire, state);
  const join = (...parts) => parts.filter(Boolean).join(' ').trim();
  if (action.type === 'ask' || action.type === 'clarify') {
    const q = action.question;
    const text = questionText(q, language);
    return {
      kind: action.type === 'clarify' ? 'clarify' : 'ask',
      question: { fieldKey: q.fieldKey, text, label: q.label || q.text, type: q.type },
      fallback: join(prefix, action.type === 'clarify' ? c.clarify(text) : text),
      quickReplies: quickRepliesFor(q, language),
      inputMode: inputModeFor(q),
      awaiting: null,
    };
  }
  if (action.type === 'confirm') {
    const q = action.question;
    const value = displayValue(state.answers[q.fieldKey]?.normalizedValue, language);
    return {
      kind: 'confirm',
      question: { fieldKey: q.fieldKey, text: q.text, label: q.label || q.text, type: q.type },
      fallback: join(prefix, c.confirm(q.label || q.text, value)),
      quickReplies: [{ label: c.yes, value: 'yes' }, { label: c.no, value: 'no' }],
      inputMode: 'text',
      awaiting: null,
    };
  }
  if (action.type === 'finish') {
    const summary = answeredSummary(questionnaire, state, language);
    return {
      kind: 'summary',
      summary,
      fallback: join(prefix, c.summary, '\n', summary.map((s) => `• ${s.label}: ${s.value}`).join('\n'), '\n', c.submitAsk),
      quickReplies: [{ label: c.submit, value: '__submit' }, { label: c.edit, value: '__edit' }],
      inputMode: 'text',
      awaiting: 'submit',
    };
  }
  if (action.type === 'disclose') {
    return {
      kind: 'start', fallback: join(prefix, c.letsContinue), awaiting: 'start', inputMode: 'text',
      quickReplies: [{ label: c.start, value: '__start' }, { label: c.notNow, value: '__not_now' }, { label: c.noContact, value: '__opt_out' }],
    };
  }
  return { kind: 'ended', reason: action.reason || null, fallback: prefix || '', quickReplies: [], inputMode: 'none', awaiting: null, persona, company };
}

/**
 * Run one customer turn.
 *
 * @param {object} p
 * @param {object} p.campaign   { questionnaire, linkConfig, agentConfig }
 * @param {object} p.session    { language, awaiting, turn, companyName, personaName }
 * @param {object} p.input      { text } | { action, value }
 * @param {object} p.tools      constrained mutators bound to this conversation (see linkAssistant.service)
 * @param {Function} [p.classify] optional model classifier for unclear answers (interpretReply contract)
 * @returns {Promise<{ plan, awaiting, outcome, intent, events }>}
 */
export async function runTurn({ campaign, session, input, tools, classify = null }) {
  const questionnaire = campaign.questionnaire;
  const language = session.language || 'en';
  const c = copyFor(language);
  const persona = session.personaName;
  const company = session.companyName;
  const events = [];
  const text = String(input.text ?? '').trim();
  const action = input.action || null;
  const plan = (state, prefix) => planForState({ questionnaire, state, language, persona, company, prefix });
  const ended = (fallback, outcome, extra = {}) => ({
    plan: { kind: 'ended', fallback, quickReplies: [], inputMode: 'none', ...extra }, awaiting: null, outcome, events,
  });

  // 1. Deterministic safety intents (buttons map onto the same paths).
  const intent = action === '__opt_out' ? 'opt_out' : (text ? detectIntent(text) : null);
  if (intent === 'opt_out') {
    await tools.doNotContact();
    events.push('opted_out');
    return { ...ended(c.optedOut({ company }), 'opted_out', { safety: true }), intent };
  }
  if (intent === 'human') {
    events.push('human_requested');
    return {
      plan: { kind: 'human', fallback: c.human({ company }), quickReplies: [{ label: c.noNote, value: '__no_note' }], inputMode: 'multiline', safety: true },
      awaiting: 'human_note', outcome: null, intent, events,
    };
  }

  let state = engine.normalizeState(await tools.getState());

  if (intent === 'are_you_human') {
    const next = plan(state);
    return {
      plan: { ...next, kind: 'are_you_human', fallback: [c.areYouHuman({ persona, company }), next.kind === 'ended' ? '' : next.fallback].filter(Boolean).join('\n\n'), safety: true },
      awaiting: session.awaiting ?? next.awaiting, outcome: null, intent, events,
    };
  }

  // 2. Pending follow-ups that consume this message.
  if (session.awaiting === 'human_note') {
    const note = action === '__no_note' ? '' : text;
    await tools.callback({ when: null, note: note ? `Human requested. Note: ${note}` : 'Human requested', human: true });
    return { ...ended(c.thanks({ company }), 'human_requested'), intent: 'human' };
  }
  if (session.awaiting === 'callback_time' && text) {
    await tools.callback({ when: text.slice(0, 120), note: `Callback requested for: ${text.slice(0, 200)}` });
    events.push('callback_requested');
    return { ...ended(c.callbackNoted(text.slice(0, 80)), 'callback_requested'), intent: 'busy' };
  }
  if (intent === 'busy') {
    return { plan: { kind: 'busy', fallback: c.busy, quickReplies: [], inputMode: 'text' }, awaiting: 'callback_time', outcome: null, intent, events };
  }

  // 3. Not started yet: the disclosure greeting is on screen.
  if (!state.disclosed) {
    if (action === '__start' || (text && AFFIRM.test(text))) {
      state = engine.normalizeState(await tools.disclose());
      events.push('chat_started');
      const next = plan(state);
      return { plan: next, awaiting: next.awaiting, outcome: null, intent: 'start', events };
    }
    if (action === '__not_now' || (text && NEGATE.test(text))) {
      return { plan: { kind: 'not_now', fallback: c.notNowReply, quickReplies: [{ label: c.start, value: '__start' }], inputMode: 'text' }, awaiting: 'start', outcome: null, intent: 'not_now', events };
    }
    // Anything else before starting is treated as a question about the contact.
    const startPlan = plan(state);
    return { plan: { ...startPlan, kind: 'question', customerQuestion: text, fallback: `${faqFallback(campaign, text, language)}${c.shallWeStart}` }, awaiting: 'start', outcome: null, intent: 'question', events };
  }

  // 4. Submit / edit at the end.
  if (session.awaiting === 'submit') {
    if (action === '__submit' || (text && AFFIRM.test(text))) {
      await tools.finish();
      events.push('completed');
      return { ...ended(c.thanks({ company }), 'completed'), intent: 'submit' };
    }
    if (action === '__edit' || (text && NEGATE.test(text))) {
      const options = answeredSummary(questionnaire, state, language).map((s) => ({ label: s.label, value: `__edit:${s.fieldKey}` }));
      return { plan: { kind: 'edit', fallback: c.editWhich, quickReplies: options, inputMode: 'text' }, awaiting: 'edit_choice', outcome: null, intent: 'edit', events };
    }
  }
  if (action && action.startsWith('__edit:')) {
    const fieldKey = action.slice('__edit:'.length);
    if ((questionnaire.questions || []).some((q) => q.fieldKey === fieldKey)) {
      state = engine.normalizeState(await tools.resetAnswer(fieldKey));
      const next = plan(state);
      return { plan: next, awaiting: next.awaiting, outcome: null, intent: 'edit', events };
    }
  }

  const open = engine.nextAction(questionnaire, state);
  const value = action && !action.startsWith('__') ? action : text;

  // 5. Read-back confirmation of a critical answer.
  if (open.type === 'confirm') {
    const yesNo = validateAnswer({ type: 'boolean' }, value === 'yes' || value === 'no' ? value : text);
    if (yesNo.validation === 'valid') {
      state = engine.normalizeState(yesNo.normalizedValue ? await tools.confirm(open.question.fieldKey) : await tools.resetAnswer(open.question.fieldKey));
      const next = plan(state, yesNo.normalizedValue ? pickAck(language, session.turn) : '');
      return { plan: next, awaiting: next.awaiting, outcome: null, intent: 'confirm', events };
    }
  }

  // 6. An answer to the open question.
  if (open.type === 'ask' || open.type === 'clarify') {
    const question = open.question;
    const interpretation = await interpretReply(question, value, { classify });
    if (interpretation.intent === 'answer') {
      const raw = interpretation.source === 'deterministic' ? value : String(interpretation.normalizedValue);
      state = engine.normalizeState(await tools.recordAnswer(question.fieldKey, raw));
      const next = plan(state, pickAck(language, session.turn));
      return { plan: { ...next, answered: { fieldKey: question.fieldKey, value: interpretation.normalizedValue } }, awaiting: next.awaiting, outcome: null, intent: 'answer', events };
    }
    if (interpretation.intent === 'unknown' || interpretation.intent === 'decline') {
      state = engine.normalizeState(await tools.markUnknown(question.fieldKey));
      const next = plan(state, pickAck(language, session.turn));
      return { plan: next, awaiting: next.awaiting, outcome: null, intent: 'unknown', events };
    }
    if (interpretation.intent === 'callback') {
      await tools.callback({ when: value.slice(0, 120), note: `Callback requested: ${value.slice(0, 200)}` });
      return { ...ended(c.callbackNoted(value.slice(0, 80)), 'callback_requested'), intent: 'callback' };
    }
    if (looksLikeQuestion(value)) {
      const next = plan(state);
      return {
        plan: { ...next, kind: 'question', customerQuestion: value, fallback: `${faqFallback(campaign, value, language)}${c.continueWith(next.question?.text || '')}` },
        awaiting: next.awaiting, outcome: null, intent: 'question', events,
      };
    }
    // Unclear: one gentle re-ask, then "unknown" (never invent a value).
    const tries = state.answers?.[question.fieldKey]?.clarifications ?? 0;
    state = engine.normalizeState(tries >= 1 ? await tools.markUnknown(question.fieldKey) : await tools.recordAnswer(question.fieldKey, value));
    const next = plan(state, tries >= 1 ? c.letsContinue : '');
    return { plan: next, awaiting: next.awaiting, outcome: null, intent: 'unclear', events };
  }

  const next = plan(state);
  return { plan: next, awaiting: next.awaiting, outcome: null, intent: null, events };
}

function faqFallback(campaign, text, language) {
  const hit = matchFaq(campaign.linkConfig?.faq, text);
  return hit ? `${hit.answer} ` : copyFor(language).faqUnknown;
}
