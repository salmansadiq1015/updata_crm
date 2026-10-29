import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcription, turnDetection } from '../src/transcription.js';

test('uses contextual committed-turn transcription instead of the mini model', () => {
  const options = transcription('en', {});
  assert.equal(options.model, 'gpt-transcribe');
  assert.deepEqual(options.languages, ['en']);
  assert.match(options.prompt, /spelled letters, email addresses, phone digits and dates exactly/);
  assert.match(options.prompt, /Do not translate/);
  assert.match(options.prompt, /inaudible speech/);
});

test('normalizes configured languages and supports multilingual speech without translating', () => {
  for (const [setting, expected] of [['en-US', 'en'], ['de-CH', 'de'], ['fr-CA', 'fr'], ['pt-BR', 'pt'], ['roman_ur', 'ur'], ['fil', 'tl'], ['ar', 'ar'], ['ja', 'ja'], ['yue', 'yue']]) {
    const options = transcription(setting, {});
    assert.equal(options.languages[0], expected);
    if (expected !== 'en') assert.ok(options.languages.includes('en'), 'English spelling/code-switching stays recognizable');
    assert.match(options.prompt, /original language, including language switches/);
  }
  for (const language of ['auto', null, '', 'invalid language']) {
    const options = transcription(language, {});
    assert.equal(options.languages, undefined);
    assert.equal(options.language, undefined);
    assert.match(options.prompt, /Detect the spoken language/);
  }
});

test('explicit transcription overrides win and invalid language hints are not sent', () => {
  assert.deepEqual(transcription('ur', { OPENAI_REALTIME_TRANSCRIBE_LANGUAGES: 'fr-CA, de-CH,fr,en,auto,invalid language' }).languages, ['fr', 'de', 'en']);
  assert.deepEqual(transcription('ur', { OPENAI_REALTIME_TRANSCRIBE_LANGUAGE: 'en-GB' }).languages, ['en']);
  assert.equal(transcription('auto', { OPENAI_REALTIME_TRANSCRIBE_LANGUAGE: 'wrong!' }).languages, undefined);
});

test('retains compatibility with explicitly selected legacy transcription models', () => {
  const options = transcription('ur', { OPENAI_REALTIME_TRANSCRIBE_MODEL: 'gpt-4o-transcribe', OPENAI_REALTIME_TRANSCRIBE_LANGUAGE: 'ur' });
  assert.equal(options.model, 'gpt-4o-transcribe');
  assert.equal(options.language, 'ur');
  assert.equal(options.languages, undefined);
  const live = transcription('ur', { OPENAI_REALTIME_TRANSCRIBE_MODEL: 'gpt-live-transcribe' });
  assert.equal(live.language, undefined);
  assert.deepEqual(live.languages, ['ur', 'en']);
});

test('gives ASR question context without feeding it known or expected personal answers', () => {
  const options = transcription('auto', {}, { questions: [
    { text: 'What is your date of birth?', type: 'date', normalizedValue: '1992-03-15' },
    { text: 'What is your email address?', type: 'email', rawAnswer: 'private@example.com' },
  ], lead: { name: 'Private Name' } });
  assert.match(options.prompt, /What is your date of birth\? \(date\)/);
  assert.match(options.prompt, /What is your email address\? \(email\)/);
  assert.doesNotMatch(options.prompt, /1992-03-15|private@example.com|Private Name/);
  assert.match(options.prompt, /context only, never answers to insert/);
  assert.ok(transcription('auto', {}, { questions: Array.from({ length: 100 }, () => ({ text: 'x'.repeat(5000) })) }).prompt.length < 3000);
});

test('allows pauses in spelling and keeps word beginnings; explicit VAD tuning still works', () => {
  const options = turnDetection({});
  assert.equal(options.silence_duration_ms, 1000);
  assert.equal(options.prefix_padding_ms, 500);
  assert.equal(turnDetection({ OPENAI_REALTIME_SILENCE_MS: '1400' }).silence_duration_ms, 1400);
  for (const value of ['0', '-1', 'NaN', 'Infinity', '99999']) assert.equal(turnDetection({ OPENAI_REALTIME_SILENCE_MS: value }).silence_duration_ms, 1000);
  assert.deepEqual(turnDetection({ OPENAI_REALTIME_TURN_DETECTION: 'semantic', OPENAI_REALTIME_EAGERNESS: 'medium' }), {
    type: 'semantic_vad', eagerness: 'medium', create_response: true, interrupt_response: true,
  });
});
