import { describe, expect, it } from '@jest/globals';
import {
  aggregateResults, normalizeText, normalizeValue, scoreExtraction, scoreFields, tokenize, wordErrorRate,
} from '../../src/modules/aiCalling/engine/benchmarkScoring.js';
import { replayCase, runCase } from '../../src/modules/aiCalling/engine/benchmarkRunner.js';
import { SAMPLE_CASES, SAMPLE_SUITE } from '../../src/modules/aiCalling/benchmarkSamples.js';

describe('word error rate', () => {
  it('counts substitutions, deletions and insertions against the reference', () => {
    expect(wordErrorRate('the cat sat on the mat', 'the cat sat on the mat')).toMatchObject({ wer: 0, substitutions: 0, deletions: 0, insertions: 0, referenceWords: 6 });
    expect(wordErrorRate('the cat sat on the mat', 'the bat sat on mat')).toMatchObject({ substitutions: 1, deletions: 1, insertions: 0, wer: 0.3333 });
    expect(wordErrorRate('yes please', 'oh yes please now')).toMatchObject({ insertions: 2, wer: 1 });
    expect(wordErrorRate('one two three', '')).toMatchObject({ deletions: 3, wer: 1 });
    expect(wordErrorRate('', 'anything').wer).toBeNull();
  });

  it('ignores case, punctuation and Latin accents', () => {
    expect(wordErrorRate('Hello, World! Café.', 'hello world cafe').wer).toBe(0);
  });

  it('tokenizes Urdu script: punctuation, diacritics, letter variants and digits are normalised', () => {
    // Arabic yeh/kaf/heh vs Urdu forms, zabar/zer diacritics, Urdu full stop and comma, Urdu digits.
    const reference = 'جی ہاں، میرا بجٹ ۵۰ ہزار ہے۔';
    const hypothesis = 'جي ہاں ميرا بَجٹ 50 ہزار ہے';
    expect(tokenize(reference)).toEqual(['جی', 'ہاں', 'میرا', 'بجٹ', '50', 'ہزار', 'ہے']);
    expect(wordErrorRate(reference, hypothesis).wer).toBe(0);
    expect(wordErrorRate(reference, 'جی نہیں میرا بجٹ 50 ہزار ہے')).toMatchObject({ substitutions: 1, wer: 0.1429 });
    expect(normalizeText('كتاب')).toBe('کتاب');
  });

  it('handles Roman Urdu and code-switched sentences as Latin tokens', () => {
    expect(wordErrorRate('Haan ji, budget 30 hazar hai', 'haan ji budget tees hazar hai')).toMatchObject({ substitutions: 1, referenceWords: 6 });
    expect(wordErrorRate('Restaurant ہے aur email bhi', 'restaurant ہے aur email bhi').wer).toBe(0);
  });
});

describe('field scoring', () => {
  const questions = [{ fieldKey: 'interested' }, { fieldKey: 'employees' }, { fieldKey: 'email' }, { fieldKey: 'budget' }];
  it('separates exact, normalized, wrong, missed and false-positive outcomes', () => {
    const fields = scoreFields(questions, [
      { fieldKey: 'interested', expected: true },
      { fieldKey: 'employees', expected: 12 },
      { fieldKey: 'email', expected: 'Ali@Example.com' },
    ], {
      interested: { validation: 'valid', normalizedValue: true },
      employees: { validation: 'valid', normalizedValue: 13 },
      email: { validation: 'valid', normalizedValue: 'ali@example.com' },
      budget: { validation: 'valid', normalizedValue: 5000 },
    });
    expect(Object.fromEntries(fields.map(f => [f.fieldKey, f.outcome]))).toEqual({ interested: 'exact', employees: 'wrong', email: 'normalized', budget: 'false_positive' });
  });

  it('an expected "don\'t know" is only correct as unknown, and a value there is a false positive', () => {
    const q = [{ fieldKey: 'email' }];
    expect(scoreFields(q, [{ fieldKey: 'email', expectUnknown: true }], { email: { validation: 'unknown', normalizedValue: null } })[0].outcome).toBe('exact');
    expect(scoreFields(q, [{ fieldKey: 'email', expectUnknown: true }], { email: { validation: 'valid', normalizedValue: 'x@y.z' } })[0].outcome).toBe('false_positive');
    expect(scoreFields(q, [{ fieldKey: 'email', expected: 'a@b.co' }], { email: { validation: 'invalid' } })[0].outcome).toBe('missed');
    expect(scoreFields(q, [], {})[0].outcome).toBe('correct_empty');
  });

  it('normalizes numbers, booleans and multi-choice order', () => {
    expect(normalizeValue('50,000')).toBe(normalizeValue('50 000'.replace(' ', '')));
    expect(normalizeValue('۵۰')).toBe('50');
    expect(normalizeValue(['b', 'a'])).toBe(normalizeValue(['a', 'b']));
    expect(normalizeValue('Yes')).toBe(normalizeValue(true));
  });
});

describe('extraction scoring', () => {
  it('matches items one-to-one by category and normalised value', () => {
    const expected = [{ category: 'budget', value: 50000 }, { category: 'objection', value: 'Too expensive' }];
    const extracted = [{ category: 'budget', value: '50000' }, { category: 'objection', value: 'too expensive!' }, { category: 'budget', value: 50000 }, { category: 'need', value: 'crm' }];
    expect(scoreExtraction(expected, extracted)).toEqual({ tp: 2, fp: 2, fn: 0, precision: 0.5, recall: 1 });
    expect(scoreExtraction([], [])).toEqual({ tp: 0, fp: 0, fn: 0, precision: null, recall: null });
  });
});

describe('aggregation', () => {
  const result = (language, conditions, outcomes, scored = true) => ({ language, conditions, scored, fields: outcomes.map((outcome, i) => ({ fieldKey: `f${i}`, outcome, expected: ['correct_empty', 'false_positive'].includes(outcome) ? null : 1 })) });
  it('scores reviewed cases only, with per-language and per-condition breakdowns', () => {
    const metrics = aggregateResults([
      result('en', ['clean'], ['exact', 'normalized', 'missed', 'correct_empty']),
      result('ur', ['noise', 'interruption'], ['exact', 'wrong', 'false_positive']),
      result('mixed', ['clean'], ['exact', 'exact'], false),
    ]);
    expect(metrics.unreviewedExcluded).toBe(1);
    expect(metrics.overall).toMatchObject({ cases: 2, expectedFields: 5, fieldAccuracy: 0.6, exactMatchRate: 0.4, missRate: 0.2, wrongRate: 0.2, falsePositiveRate: 0.5, falsePositives: 1 });
    expect(Object.keys(metrics.byLanguage).sort()).toEqual(['en', 'ur']);
    expect(metrics.byCondition.noise.cases).toBe(1);
    expect(metrics.byCondition.interruption.cases).toBe(1);
    expect(metrics.byLanguage.en.fieldAccuracy).toBeCloseTo(2 / 3, 3);
  });

  it('no reviewed cases → no score (null, not zero)', () => {
    const metrics = aggregateResults([result('en', ['clean'], ['exact'], false)]);
    expect(metrics.overall.fieldAccuracy).toBeNull();
    expect(metrics.overall.cases).toBe(0);
  });
});

describe('text-level replay through the deterministic pipeline', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const byTitle = t => SAMPLE_CASES.find(c => c.title.includes(t));

  it('replays the English sample exactly as a call would capture it', () => {
    const { predicted, trace } = replayCase(SAMPLE_SUITE.questionnaire, byTitle('English, clean').turns, { now });
    expect(predicted).toMatchObject({
      interested: { validation: 'valid', normalizedValue: true }, business_type: { normalizedValue: 'restaurant' },
      employees: { normalizedValue: 12 }, monthly_budget: { normalizedValue: 50000 }, email: { normalizedValue: 'ali@example.com' },
    });
    expect(trace.filter(t => t.result === 'answered')).toHaveLength(5);
  });

  it('scores Urdu digits, spoken Urdu numbers and "30 hazar" correctly (former pipeline gaps)', async () => {
    const urdu = await runCase({ ...byTitle('Urdu script'), reviewed: true }, SAMPLE_SUITE.questionnaire, { now });
    const outcome = Object.fromEntries(urdu.fields.map(f => [f.fieldKey, f.outcome]));
    expect(outcome).toMatchObject({ interested: 'exact', business_type: 'exact', email: 'exact' }); // "پتہ نہیں" captured as unknown
    expect(urdu.fields.find(f => f.fieldKey === 'employees')).toMatchObject({ outcome: 'exact', predicted: 8 }); // "۸"
    expect(urdu.fields.find(f => f.fieldKey === 'monthly_budget')).toMatchObject({ outcome: 'exact', predicted: 50000 }); // "پچاس ہزار"
    const roman = await runCase({ ...byTitle('Roman Urdu'), reviewed: true }, SAMPLE_SUITE.questionnaire, { now });
    expect(roman.fields.find(f => f.fieldKey === 'monthly_budget')).toMatchObject({ outcome: 'exact', predicted: 30000 });
  });

  it('applies a volunteered answer to its named field (code-switching case)', () => {
    const { predicted } = replayCase(SAMPLE_SUITE.questionnaire, byTitle('code-switching').turns, { now });
    expect(predicted.business_type.normalizedValue).toBe('restaurant');
    expect(predicted.email.normalizedValue).toBe('bilal@example.com');
    expect(predicted.employees.normalizedValue).toBe(20);
  });

  it('marks unreviewed cases as not scored; runs an injected extractor and transcriber', async () => {
    const sample = byTitle('English, clean');
    const extractor = async () => ({ items: [{ category: 'budget', value: 50000 }, { category: 'need', value: 'pos' }], needsReview: 1, rejected: 2 });
    const result = await runCase({ ...sample, audio: { fileId: 'f1', referenceTranscript: 'yes sure we run a restaurant' } }, SAMPLE_SUITE.questionnaire, {
      now, extractor, transcribe: async () => ({ text: 'yes sure we run restaurant', language: 'en', provider: 'whisper' }),
    });
    expect(result.scored).toBe(false);
    expect(result.extraction).toMatchObject({ status: 'ok', tp: 1, fp: 1, fn: 0, needsReview: 1, rejectedByEvidence: 2 });
    expect(result.audio).toMatchObject({ status: 'ok', deletions: 1, wer: 0.1667 });
    const failing = await runCase(sample, SAMPLE_SUITE.questionnaire, { now, extractor: async () => { throw new Error('AI provider is not configured'); } });
    expect(failing.extraction).toEqual({ status: 'error', error: 'AI provider is not configured' });
  });

  it('every sample case is labelled SAMPLE and carries ground truth for the suite fields only', () => {
    const keys = new Set(SAMPLE_SUITE.questionnaire.questions.map(q => q.fieldKey));
    for (const c of SAMPLE_CASES) {
      expect(c.title.startsWith('SAMPLE')).toBe(true);
      expect(c.reviewed).toBeUndefined();
      for (const a of c.groundTruth.answers) expect(keys.has(a.fieldKey)).toBe(true);
    }
    expect(new Set(SAMPLE_CASES.map(c => c.language))).toEqual(new Set(['en', 'ur', 'mixed']));
    expect(SAMPLE_CASES.flatMap(c => c.conditions)).toEqual(expect.arrayContaining(['clean', 'noise', 'interruption']));
  });
});
