import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { languageEvidence, initialLanguage, voicePolicy, addEvent, behaviorSummary } from '../../src/modules/aiCalling/engine/conversationPolicy.js';
import * as engine from '../../src/modules/aiCalling/engine/questionEngine.js';
import { buildSystemPrompt } from '../../src/modules/aiCalling/engine/leadContext.js';
const at = '2026-11-03T10:00:00.000Z';
const report = (language, extra = {}) => ({ language, explicit: false, confidence: 0.99, evidence: 'I would like to talk about your current offering please', requestId: randomUUID(), turnId: randomUUID(), ...extra });

test('configured Arabic opens every fresh call; explicit French preserves completed answers and stays isolated', () => {
  const config = { language: 'ar', supportedLanguages: ['ar', 'en', 'fr'] };
  const state = { ...engine.initConversationState(), disclosed: true, answers: { name: { validation: 'valid', normalizedValue: 'John' } } };
  assert.equal(initialLanguage(config), 'ar');
  const changed = languageEvidence(state, config, report('fr', { explicit: true, evidence: 'Can you speak French?' }), at);
  assert.equal(changed.language.current, 'fr'); assert.equal(changed.language.initial, 'ar');
  assert.deepEqual(changed.answers, state.answers); assert.equal(config.language, 'ar');
  assert.equal(initialLanguage(config), 'ar'); assert.equal(changed.language.switches[0].mode, 'explicit');
  assert.match(buildSystemPrompt({ agentConfig: config }), /start the call in Arabic/);
});

test('automatic Arabic/English detection requires sustained evidence, not names, words, low confidence or duplicate turns', () => {
  const config = { language: 'ar' };
  let state = languageEvidence({}, config, report('en', { evidence: 'Microsoft' }), at);
  assert.equal(state.language.current, 'ar');
  state = languageEvidence(state, config, report('en', { confidence: 0.5 }), at);
  assert.equal(state.language.current, 'ar');
  const evidence = report('en');
  state = languageEvidence(state, config, evidence, at);
  const duplicate = languageEvidence(state, config, { ...evidence, requestId: randomUUID() }, at);
  assert.equal(duplicate.language.current, 'ar');
  state = languageEvidence(state, config, report('en'), at);
  assert.equal(state.language.current, 'en'); assert.equal(state.language.switches.length, 1);
  state = languageEvidence(state, config, report('ar', { source: 'asr', confidence: undefined, evidence: 'أريد معرفة المزيد عن خدماتكم وما تقدمونه من عروض' }), at);
  state = languageEvidence(state, config, report('ar', { source: 'asr', confidence: undefined, evidence: 'نعم أود أن نواصل الحديث باللغة العربية من فضلك' }), at);
  assert.equal(state.language.current, 'ar');
});

test('explicit requests win over automatic evidence from the same turn and respect supported languages and preference toggle', () => {
  const config = { language: 'ar', automaticLanguageSwitching: false, automaticLanguageDetection: false, supportedLanguages: ['fr', 'ar'] };
  let state = languageEvidence({}, config, report('fr', { explicit: true, turnId: 'turn-1' }), at);
  assert.equal(state.language.current, 'fr');
  state = languageEvidence(state, config, report('ar', { source: 'asr', turnId: 'turn-1' }), at);
  assert.equal(state.language.current, 'fr');
  state = languageEvidence(state, config, report('de', { explicit: true }), at);
  assert.equal(state.language.current, 'fr');
  state = languageEvidence({}, { ...config, followLeadLanguage: false }, report('fr', { explicit: true }), at);
  assert.equal(state.language.current, 'ar');
});

test('Moroccan Darija stays a distinct configured dialect', () => {
  const config = { language: 'ar-MA', supportedLanguages: ['ar-MA', 'fr'] };
  assert.equal(initialLanguage(config), 'ar-MA');
  let state = languageEvidence({}, config, report('fr', { explicit: true }), at);
  assert.equal(state.language.initial, 'ar-MA'); assert.equal(state.language.current, 'fr');
  state = languageEvidence({}, { language: 'ar-MA', languageSwitchSensitivity: 'high' }, report('ar', { source: 'asr', evidence: 'بغيت نهضر معاك على الخدمة ديالكم عافاك' }), at);
  assert.equal(state.language.current, 'ar-MA');
});

const questionnaire = { questions: ['one', 'two', 'three', 'four'].map((fieldKey, order) => ({ fieldKey, order, text: fieldKey })) };
test('strict configurable repeats then consecutive unanswered threshold; shared non-voice engine behavior stays compatible', () => {
  const config = { maxRepetitionAttempts: 2, maxUnansweredQuestions: 3 };
  let state = { ...engine.initConversationState(), disclosed: true };
  for (const fieldKey of ['one', 'two', 'three']) {
    assert.equal(engine.nextAction(questionnaire, state, voicePolicy(config)).question.fieldKey, fieldKey);
    for (let n = 1; n <= 3; n++) {
      const requestId = randomUUID();
      state = engine.applyNoResponse(state, fieldKey, { requestId, reason: 'silence', maxRepeats: 2 });
      assert.equal(engine.applyNoResponse(state, fieldKey, { requestId, reason: 'silence', maxRepeats: 2 }).answers[fieldKey].noResponseCount, n);
      if (n <= 2) assert.equal(engine.nextAction(questionnaire, state, voicePolicy(config)).question.fieldKey, fieldKey);
    }
  }
  assert.deepEqual(engine.nextAction(questionnaire, state, voicePolicy(config)), { type: 'end', reason: 'unresponsive' });
  assert.equal(engine.nextAction(questionnaire, state, voicePolicy({ ...config, automaticCallTermination: false })).question.fieldKey, 'four');
  assert.equal(engine.nextAction(questionnaire, state).type, 'ask');
});

test('a meaningful answer resets retries and breaks a consecutive-unanswered sequence without fabricating missing answers', () => {
  let state = { disclosed: true, answers: { one: { validation: 'invalid', noResponseCount: 4 }, two: { validation: 'invalid', noResponseCount: 2 } } };
  state = engine.applyAnswer(state, 'two', { validation: 'valid', rawAnswer: 'Actual answer', normalizedValue: 'Actual answer' });
  assert.equal(state.answers.two.noResponseCount, 0);
  state = engine.applyNoResponse(state, 'three', { requestId: randomUUID(), reason: 'silence' });
  assert.equal(engine.nextAction(questionnaire, state, voicePolicy({ maxUnansweredQuestions: 2 })).question.fieldKey, 'three');
  assert.equal(state.answers.one.normalizedValue, undefined);
});

test('behavior metrics deduplicate deliveries, preserve aggregates without history, and never infer disinterest from pauses', () => {
  let state = { answers: { one: { validation: 'valid' } } };
  const event = { id: randomUUID(), type: 'response_started', responseMs: 15000, at };
  state = addEvent(state, event, { saveBehaviorHistory: false });
  state = addEvent(state, event, { saveBehaviorHistory: false });
  assert.equal(state.events, undefined);
  let summary = behaviorSummary(state, 1);
  assert.equal(summary.averageResponseMs, 15000); assert.equal(summary.engagement, 'HIGH_ENGAGEMENT');
  assert.equal(behaviorSummary({}, 1).averageResponseMs, null);
  const disabled = addEvent({}, event, { trackResponseBehavior: false });
  assert.equal(disabled.events, undefined); assert.equal(disabled.behaviorMetrics, undefined);
  assert.equal(behaviorSummary(state, 1, { conversationAnalytics: false }), null);
  summary = behaviorSummary(state, 1, { classifyEngagement: false, trackEngagement: false, trackResponseBehavior: false });
  assert.equal(summary.engagement, null); assert.equal(summary.interruptions, null); assert.equal(summary.repeats, null);
});
