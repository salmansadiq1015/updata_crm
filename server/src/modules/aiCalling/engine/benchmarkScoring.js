/**
 * Benchmark scorers — pure functions.
 *
 *  - wordErrorRate: (substitutions + deletions + insertions) / reference words, with a
 *    tokenizer that handles Latin script and Urdu (Arabic script): Unicode NFKC, Arabic-
 *    script letter variants unified (ي/ى→ی, ك→ک, ه→ہ), diacritics/tatweel/ZWNJ removed,
 *    Urdu and Latin punctuation stripped, Eastern Arabic and Urdu digits → ASCII.
 *  - field scoring: exact match, normalized match, miss, false positive per questionnaire field.
 *  - extraction scoring: precision/recall of extracted items against reviewed items.
 *
 * Only reviewed cases count toward a score (aggregateResults filters on `scored`).
 */

const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
const digitValue = (ch) => {
  const code = ch.charCodeAt(0);
  return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
};

/** Text normalised for comparison (case, width, script variants, punctuation). */
export function normalizeText(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(ARABIC_DIGITS, digitValue)
    .replace(/[\u064A\u0649]/g, '\u06CC') // Arabic yeh / alef maksura -> Farsi/Urdu yeh
    .replace(/\u0643/g, '\u06A9') // Arabic kaf -> keheh
    .replace(/\u0647/g, '\u06C1') // heh -> heh goal (Urdu)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '') // harakat, superscript alef, Quranic marks, tatweel
    .replace(/\u200C|\u200D|\u200E|\u200F|\uFEFF/g, '') // ZWNJ/ZWJ/bidi marks
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '') // Latin accents
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ') // punctuation incl. Urdu comma, full stop, question mark
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text) {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(' ') : [];
}

/** Word error rate with an edit-script breakdown. Empty reference → wer null. */
export function wordErrorRate(reference, hypothesis) {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  const n = ref.length; const m = hyp.length;
  // dp[i][j] = [cost, subs, dels, ins] aligning ref[0..i) with hyp[0..j)
  let prev = Array.from({ length: m + 1 }, (_, j) => [j, 0, 0, j]);
  for (let i = 1; i <= n; i += 1) {
    const row = [[i, 0, i, 0]];
    for (let j = 1; j <= m; j += 1) {
      const same = ref[i - 1] === hyp[j - 1];
      const diag = prev[j - 1];
      const candidates = [
        [diag[0] + (same ? 0 : 1), diag[1] + (same ? 0 : 1), diag[2], diag[3]],
        [prev[j][0] + 1, prev[j][1], prev[j][2] + 1, prev[j][3]], // deletion
        [row[j - 1][0] + 1, row[j - 1][1], row[j - 1][2], row[j - 1][3] + 1], // insertion
      ];
      row.push(candidates.reduce((best, c) => (c[0] < best[0] ? c : best)));
    }
    prev = row;
  }
  const [errors, substitutions, deletions, insertions] = prev[m];
  return { wer: n ? Number((errors / n).toFixed(4)) : null, substitutions, deletions, insertions, referenceWords: n, hypothesisWords: m };
}

/** A value in comparable form: arrays order-insensitive, numbers numeric, text normalised. */
export function normalizeValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(normalizeValue).filter(v => v != null).sort().join('|');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  const text = normalizeText(value);
  if (/^-?\d+(\.\d+)?$/.test(text.replace(/\s/g, ''))) return String(Number(text.replace(/\s/g, '')));
  if (['true', 'yes'].includes(text)) return 'true';
  if (['false', 'no'].includes(text)) return 'false';
  return text;
}

const strictEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Score one case's predicted answers against reviewed ground truth.
 * @param questions questionnaire questions (fieldKey set defines the slots)
 * @param expected [{ fieldKey, expected, expectUnknown }]
 * @param predicted { [fieldKey]: { validation, normalizedValue } }
 */
export function scoreFields(questions, expected = [], predicted = {}) {
  const truth = new Map(expected.map(e => [e.fieldKey, e]));
  const keys = [...new Set([...questions.map(q => q.fieldKey), ...truth.keys()])];
  return keys.map((fieldKey) => {
    const want = truth.get(fieldKey);
    const got = predicted[fieldKey] || null;
    const hasValue = got?.validation === 'valid';
    const base = { fieldKey, expected: want ? (want.expectUnknown ? '(unknown)' : want.expected) : null, predicted: hasValue ? got.normalizedValue : null, validation: got?.validation || null };
    if (want && !want.expectUnknown) {
      if (!hasValue) return { ...base, outcome: 'missed' };
      if (strictEqual(got.normalizedValue, want.expected)) return { ...base, outcome: 'exact' };
      if (normalizeValue(got.normalizedValue) === normalizeValue(want.expected)) return { ...base, outcome: 'normalized' };
      return { ...base, outcome: 'wrong' };
    }
    if (want?.expectUnknown) {
      if (got?.validation === 'unknown') return { ...base, outcome: 'exact' };
      return { ...base, outcome: hasValue ? 'false_positive' : 'missed' };
    }
    return { ...base, outcome: hasValue ? 'false_positive' : 'correct_empty' };
  });
}

/** Precision/recall of extracted items, matched one-to-one by category + normalised value. */
export function scoreExtraction(expectedItems = [], extractedItems = []) {
  const key = i => `${normalizeText(i?.category)}::${normalizeValue(i?.value)}`;
  const pool = new Map();
  for (const item of expectedItems) pool.set(key(item), (pool.get(key(item)) || 0) + 1);
  let tp = 0;
  for (const item of extractedItems) {
    const k = key(item);
    if (pool.get(k) > 0) { tp += 1; pool.set(k, pool.get(k) - 1); }
  }
  const fp = extractedItems.length - tp;
  const fn = expectedItems.length - tp;
  return {
    tp, fp, fn,
    precision: extractedItems.length ? Number((tp / extractedItems.length).toFixed(4)) : null,
    recall: expectedItems.length ? Number((tp / expectedItems.length).toFixed(4)) : null,
  };
}

const ratio = (n, d) => (d ? Number((n / d).toFixed(4)) : null);

/** Metrics over a set of case results (callers pass scored cases only). */
export function summarizeCases(results) {
  const c = { cases: results.length, expectedFields: 0, exact: 0, normalized: 0, wrong: 0, missed: 0, falsePositives: 0, emptySlots: 0, extraction: { tp: 0, fp: 0, fn: 0, cases: 0 }, wer: { errors: 0, words: 0, cases: 0 } };
  for (const r of results) {
    for (const f of r.fields || []) {
      const expectsAnswer = f.expected != null;
      if (expectsAnswer) c.expectedFields += 1;
      if (f.expected == null || f.expected === '(unknown)') c.emptySlots += 1;
      if (f.outcome === 'exact') c.exact += 1;
      else if (f.outcome === 'normalized') c.normalized += 1;
      else if (f.outcome === 'wrong') c.wrong += 1;
      else if (f.outcome === 'missed') c.missed += 1;
      else if (f.outcome === 'false_positive') c.falsePositives += 1;
    }
    if (r.extraction?.status === 'ok') { c.extraction.cases += 1; c.extraction.tp += r.extraction.tp; c.extraction.fp += r.extraction.fp; c.extraction.fn += r.extraction.fn; }
    if (r.audio?.status === 'ok' && r.audio.referenceWords) {
      c.wer.cases += 1; c.wer.words += r.audio.referenceWords;
      c.wer.errors += r.audio.substitutions + r.audio.deletions + r.audio.insertions;
    }
  }
  return {
    cases: c.cases,
    expectedFields: c.expectedFields,
    fieldAccuracy: ratio(c.exact + c.normalized, c.expectedFields),
    exactMatchRate: ratio(c.exact, c.expectedFields),
    missRate: ratio(c.missed, c.expectedFields),
    wrongRate: ratio(c.wrong, c.expectedFields),
    falsePositiveRate: ratio(c.falsePositives, c.emptySlots),
    falsePositives: c.falsePositives,
    extraction: c.extraction.cases ? {
      cases: c.extraction.cases,
      precision: ratio(c.extraction.tp, c.extraction.tp + c.extraction.fp),
      recall: ratio(c.extraction.tp, c.extraction.tp + c.extraction.fn),
    } : null,
    wer: c.wer.cases ? { cases: c.wer.cases, value: ratio(c.wer.errors, c.wer.words), referenceWords: c.wer.words } : null,
  };
}

/** Official metrics (reviewed cases only) with per-language and per-condition breakdowns. */
export function aggregateResults(caseResults) {
  const scored = caseResults.filter(r => r.scored);
  const group = (keyOf) => {
    const map = new Map();
    for (const r of scored) for (const k of [].concat(keyOf(r))) { if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
    return Object.fromEntries([...map.entries()].map(([k, rows]) => [k, summarizeCases(rows)]));
  };
  return {
    overall: summarizeCases(scored),
    byLanguage: group(r => r.language),
    byCondition: group(r => (r.conditions?.length ? r.conditions : ['clean'])),
    unreviewedExcluded: caseResults.length - scored.length,
  };
}
