/** Pure per-call policies. No campaign/agent objects are ever mutated. */
import { defaultAgentLanguage, resolveAgentLanguage, canonicalAgentLanguage } from '../aiCalling.languages.js';

export const retryLimit = config => config?.maxRepetitionAttempts ?? 3;
export const voicePolicy = config => ({ maxRepeats: retryLimit(config), maxUnansweredQuestions: config?.maxUnansweredQuestions ?? 3, automaticCallTermination: config?.automaticCallTermination !== false });
export function initialLanguage(config = {}) {
  const lang = resolveAgentLanguage(config.language);
  return lang && lang.code !== 'auto' ? canonicalAgentLanguage(config.language) : defaultAgentLanguage().code;
}
export function initialCallState(config = {}, at = new Date().toISOString()) {
  const language = { configured: config.language || initialLanguage(config), initial: initialLanguage(config), current: initialLanguage(config), detected: null, switches: [],
    configuration: { supportedLanguages: config.supportedLanguages || [], automaticDetection: config.automaticLanguageDetection !== false, automaticSwitching: config.automaticLanguageSwitching !== false, followLeadPreference: config.followLeadLanguage !== false, sensitivity: config.languageSwitchSensitivity || 'medium' } };
  return addEvent({ disclosed: false, endedReason: null, answers: {}, language }, { id: 'call-started', at, type: 'call_started', language: language.initial }, config);
}
export function addEvent(state, event, config = {}) {
  if (config.trackResponseBehavior === false && ['question_waiting', 'response_started', 'silence', 'question_repeated', 'question_unanswered', 'answer_classified'].includes(event.type)) return state;
  if ((state.eventReceipts || []).includes(event.id)) return state;
  const metrics = { ...(state.behaviorMetrics || {}) };
  const response = config.trackResponseBehavior !== false;
  const engagement = config.trackEngagement !== false;
  if (response && event.type === 'question_waiting') metrics.asked = [...new Set([...(metrics.asked || []), event.fieldKey])];
  const count = key => { metrics[key] = (metrics[key] || 0) + 1; };
  if (response && event.type === 'question_repeated') count('repeats');
  if (response && event.type === 'silence') count('silenceEvents');
  if (response && event.classification === 'NEEDS_CLARIFICATION') count('clarificationRequests');
  if (response && event.classification === 'PARTIALLY_ANSWERED') count('incompleteAnswers');
  if (engagement && event.type === 'interruption') count('interruptions');
  if (engagement && ['lead_question', 'information_requested', 'interest_expressed'].includes(event.type)) count(event.type);
  if (response && event.type === 'response_started' && Number.isFinite(event.responseMs)) {
    count('responseCount'); metrics.responseTotalMs = (metrics.responseTotalMs || 0) + event.responseMs;
    metrics.longestResponseMs = Math.max(metrics.longestResponseMs || 0, event.responseMs);
  }
  return { ...state, behaviorMetrics: metrics,
    eventReceipts: [...(state.eventReceipts || []), event.id].slice(-2000),
    ...(config.saveBehaviorHistory === false ? {} : { events: [...(state.events || []), event].slice(-2000) }) };
}
export function languageEvidence(state, config, { language, explicit, confidence, evidence, requestId, source = 'audio_model', turnId }, at) {
  const code = canonicalAgentLanguage(language);
  const lang = resolveAgentLanguage(code);
  const current = state.language || { initial: initialLanguage(config), current: initialLanguage(config), detected: null, switches: [] };
  if (current.receipts?.includes(requestId) || !explicit && turnId && (current.explicitTurnId === turnId || current.detectionTurnId === turnId)) return state;
  const supported = !config.supportedLanguages?.length || config.supportedLanguages.includes(code) || code === current.initial;
  let words;
  try { words = [...new Intl.Segmenter(lang?.code, { granularity: 'word' }).segment(String(evidence || ''))].filter(part => part.isWordLike); }
  catch { words = String(evidence || '').match(/[\p{L}\p{N}]+/gu) || []; }
  const sufficient = words.length >= (config.languageSwitchSensitivity === 'high' ? 4 : 6) && (source === 'asr' || confidence >= (config.languageSwitchSensitivity === 'high' ? 0.8 : 0.9));
  const seen = current.candidate === code ? (current.candidateTurns || 0) + 1 : 1;
  const required = config.languageSwitchSensitivity === 'high' ? 1 : config.languageSwitchSensitivity === 'low' ? 3 : 2;
  const enabled = config.followLeadLanguage !== false && (explicit || config.automaticLanguageDetection !== false && config.automaticLanguageSwitching !== false);
  const genericRecognition = source === 'asr' && current.current.startsWith(`${code}-`);
  const switchNow = Boolean(!genericRecognition && lang && code !== 'auto' && supported && enabled && code !== current.current && (explicit || sufficient && seen >= required));
  const next = { ...current, detected: explicit || config.automaticLanguageDetection === false ? current.detected : code,
    candidate: sufficient ? code : null, candidateTurns: sufficient ? seen : 0,
    ...(explicit ? { explicitTurnId: turnId } : { detectionTurnId: turnId }),
    receipts: [...(current.receipts || []), requestId].slice(-100),
    current: switchNow ? code : current.current,
    switches: switchNow ? [...current.switches, { at, from: current.current, to: code, mode: explicit ? 'explicit' : 'automatic' }] : current.switches };
  return addEvent({ ...state, language: next }, { id: requestId, at, type: switchNow ? 'language_switch' : 'language_detected', language: code, explicit, evidence, source, confidence: confidence ?? null, accepted: switchNow }, config);
}

/** Explainable observable outcomes. Response speed never lowers engagement. */
export function behaviorSummary(state, total, config = {}) {
  if (config.conversationAnalytics === false) return null;
  const entries = Object.values(state.answers || {});
  const metrics = state.behaviorMetrics || {};
  const answered = entries.filter(a => a.validation === 'valid').length;
  const unanswered = entries.filter(a => a.validation === 'invalid' && (a.noResponseCount || 0) + (a.clarifications || 0) > retryLimit(config)).length;
  const classification = state.endedReason === 'callback_requested' ? 'CALLBACK_REQUESTED'
    : ['declined', 'do_not_contact'].includes(state.endedReason) ? 'NOT_INTERESTED'
      : unanswered > 0 && answered === 0 ? 'UNRESPONSIVE'
        : total && answered / total >= 0.7 ? 'HIGH_ENGAGEMENT' : answered ? 'MEDIUM_ENGAGEMENT' : 'LOW_ENGAGEMENT';
  return { totalQuestions: total, answered, unanswered,
    questionsAsked: config.trackResponseBehavior === false ? null : metrics.asked?.length || 0,
    repeats: config.trackResponseBehavior === false ? null : metrics.repeats || 0,
    silenceEvents: config.trackResponseBehavior === false ? null : metrics.silenceEvents || 0,
    clarificationRequests: config.trackResponseBehavior === false ? null : metrics.clarificationRequests || 0,
    incompleteAnswers: config.trackResponseBehavior === false ? null : metrics.incompleteAnswers || 0,
    interruptions: config.trackEngagement === false ? null : metrics.interruptions || 0,
    leadQuestions: config.trackEngagement === false ? null : metrics.lead_question || 0,
    informationRequests: config.trackEngagement === false ? null : metrics.information_requested || 0,
    expressedInterest: config.trackEngagement === false ? null : metrics.interest_expressed || 0,
    languageSwitches: state.language?.switches?.length || 0,
    averageResponseMs: metrics.responseCount ? metrics.responseTotalMs / metrics.responseCount : null,
    longestResponseMs: metrics.responseCount ? metrics.longestResponseMs : null,
    completionPercentage: total ? Math.round(100 * answered / total) : 0,
    engagement: config.classifyEngagement === false ? null : classification,
    engagementEvidence: { answered, unanswered, total, control: state.endedReason || null } };
}
