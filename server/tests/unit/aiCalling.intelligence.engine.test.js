import { describe, expect, it } from '@jest/globals';
import {
  acceptProposals, markConflicts, mergeWithPrevious, normalizeWs, parseExtraction, toQualificationAnswers,
  validateCorrection, buildExtractionMessages,
} from '../../src/modules/aiCalling/engine/callIntelligence.js';
import {
  buildKnowledgeSection, checkCompliance, diffKnowledgeVersions, extractAmounts,
} from '../../src/modules/aiCalling/engine/knowledgeCompliance.js';
import {
  fallbackScript, selectTransferTargets, withinWorkingHours, clampTimeout, activeHandoffExemption,
} from '../../src/modules/aiCalling/engine/handoffPolicy.js';

const at = s => new Date(Date.UTC(2026, 9, 29, 10, 0, s));
const turns = [
  { itemId: 'a0', role: 'assistant', text: 'Hello, this is Tess, an AI assistant. Do you have a minute?', at: at(0) },
  { itemId: 'c1', role: 'customer', text: 'Yes.   Our  main problem is   missed calls after hours.', at: at(5) },
  { itemId: 'a2', role: 'assistant', text: 'So your budget is around 50,000 rupees per month?', at: at(10) },
  { itemId: 'c3', role: 'customer', text: 'جی ہاں', at: at(14) },
  { itemId: 'c4', role: 'customer', text: 'Mera budget 50000 hai, lekin price thoda zyada lag raha hai. Faisla mere partner karte hain.', at: at(20) },
  { itemId: 'c5', role: 'customer', text: 'ہمیں یہ اگلے مہینے تک چاہیے', at: at(26) },
];

describe('evidence acceptance', () => {
  it('accepts lead quotes verbatim after whitespace normalization only, with turn evidence', () => {
    const { items, rejected } = acceptProposals([
      { category: 'need', value: 'Missed calls after hours', quote: 'Our main problem is missed calls after hours.', turnIndex: 1, speaker: 'lead', confidence: 0.92 },
    ], turns, { answeredAt: at(0) });
    expect(rejected).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: 'need', status: 'accepted', turnIndex: 1, turnItemId: 'c1', speaker: 'lead', startMs: 5000 });
  });

  it('rejects paraphrased or misplaced quotes (no invented evidence)', () => {
    const { items, rejected } = acceptProposals([
      { category: 'need', value: 'x', quote: 'Our biggest problem is missed calls', turnIndex: 1, confidence: 0.9 },
      { category: 'need', value: 'x', quote: 'missed calls after hours', turnIndex: 4, confidence: 0.9 },
      { category: 'need', value: 'x', quote: 'missed calls', turnIndex: 99, confidence: 0.9 },
      { category: 'emotion', value: 'happy', quote: 'Yes.', turnIndex: 1, confidence: 0.9 },
    ], turns);
    expect(items).toEqual([]);
    expect(rejected.map(r => r.reason)).toEqual(['quote_not_in_turn', 'quote_not_in_turn', 'turn_out_of_range', 'unknown_category']);
  });

  it('keeps Roman Urdu / Urdu-script quotes in the original script and validates typed values', () => {
    const { items } = acceptProposals([
      { category: 'budget', value: '50000 PKR', normalized: '50000', quote: 'Mera budget 50000 hai', turnIndex: 4, confidence: 0.9 },
      { category: 'objection', value: 'Price feels high', quote: 'price thoda zyada lag raha hai', turnIndex: 4, confidence: 0.85 },
      { category: 'authority', value: 'Partner decides', normalized: 'influencer', quote: 'Faisla mere partner karte hain.', turnIndex: 4, confidence: 0.8 },
      { category: 'timeline', value: 'Next month', normalized: 'within_3_months', quote: 'ہمیں یہ اگلے مہینے تک چاہیے', turnIndex: 5, confidence: 0.9 },
    ], turns);
    expect(items.map(i => [i.category, i.status, i.normalized])).toEqual([
      ['budget', 'accepted', 50000], ['objection', 'accepted', null], ['authority', 'accepted', 'influencer'], ['timeline', 'accepted', 'within_3_months'],
    ]);
    expect(items[3].quote).toBe('ہمیں یہ اگلے مہینے تک چاہیے');
  });

  it('rejects agent speech, but keeps an agent read-back the lead affirmed — for review only', () => {
    const { items, rejected } = acceptProposals([
      { category: 'budget', value: '50,000', normalized: '50000', quote: 'So your budget is around 50,000 rupees per month?', turnIndex: 2, speaker: 'agent', confidence: 0.95 },
    ], turns);
    const unconfirmed = acceptProposals([{ category: 'need', value: 'x', quote: 'You need a website', turnIndex: 0, speaker: 'agent', confidence: 0.95 }],
      [{ role: 'assistant', text: 'You need a website, right?' }, { role: 'customer', text: 'Hmm, not sure about that.' }]);
    rejected.push(...unconfirmed.rejected);
    expect(rejected.map(r => r.reason)).toEqual(['agent_speech']);
    expect(items[0]).toMatchObject({ speaker: 'agent', status: 'needs_review' });
    expect(items[0].reviewReasons).toContain('agent_readback');
  });

  it('low confidence, missing confidence and invalid typed values need review', () => {
    const { items } = acceptProposals([
      { category: 'need', value: 'x', quote: 'missed calls', turnIndex: 1, confidence: 0.5 },
      { category: 'objection', value: 'x', quote: 'price thoda', turnIndex: 4 },
      { category: 'authority', value: 'partner', normalized: 'the boss', quote: 'Faisla mere partner', turnIndex: 4, confidence: 0.9 },
    ], turns);
    expect(items.map(i => [i.status, i.reviewReasons])).toEqual([
      ['needs_review', ['low_confidence']], ['needs_review', ['low_confidence']], ['needs_review', ['invalid_value']],
    ]);
  });

  it('conflicting single-valued facts all go to review; duplicates keep the stronger one', () => {
    const { items } = acceptProposals([
      { category: 'budget', value: '50000', normalized: '50000', quote: 'Mera budget 50000 hai', turnIndex: 4, confidence: 0.9 },
      { category: 'budget', value: '50000', normalized: '50000', quote: 'Mera budget 50000 hai', turnIndex: 4, confidence: 0.95 },
      { category: 'budget', value: '50 per month', normalized: '50', quote: 'So your budget is around 50,000 rupees', turnIndex: 2, confidence: 0.6 },
    ], turns);
    expect(items).toHaveLength(2);
    expect(items[0].confidence).toBe(0.95);
    expect(items.every(i => i.status === 'needs_review' && i.reviewReasons.includes('conflict'))).toBe(true);
  });

  it('a re-run keeps user decisions and lead writes, and retains decided items not re-proposed', () => {
    const first = acceptProposals([{ category: 'need', value: 'x', quote: 'missed calls', turnIndex: 1, confidence: 0.4 }], turns).items;
    const decided = [{ ...first[0], status: 'user_edited', value: 'After-hours calls', review: { decision: 'edit' }, leadWrite: { status: 'applied' } },
      { id: 'gone', category: 'objection', status: 'user_rejected', review: { decision: 'reject' }, quote: 'q', turnIndex: 1, speaker: 'lead', reviewReasons: [] }];
    const again = acceptProposals([{ category: 'need', value: 'x', quote: 'missed calls', turnIndex: 1, confidence: 0.9 }], turns).items;
    const merged = mergeWithPrevious(again, decided);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ status: 'user_edited', value: 'After-hours calls', leadWrite: { status: 'applied' } });
    expect(merged[1].id).toBe('gone');
  });

  it('maps accepted items to qualification answers with transcript references', () => {
    const { items } = acceptProposals([
      { category: 'objection', value: 'Price high', quote: 'price thoda zyada', turnIndex: 4, confidence: 0.9 },
      { category: 'need', value: 'Missed calls', quote: 'missed calls after hours', turnIndex: 1, confidence: 0.9 },
      { category: 'need', value: 'Coverage next month', quote: 'اگلے مہینے', turnIndex: 5, confidence: 0.9 },
      { category: 'urgency', value: 'soon', normalized: 'soon', quote: 'اگلے مہینے تک', turnIndex: 5, confidence: 0.9 },
    ], turns);
    const answers = toQualificationAnswers(items, { callRecordId: 'rec1' });
    expect(answers.map(a => a.fieldKey)).toEqual(['objections', 'need']);
    const need = answers.find(a => a.fieldKey === 'need');
    expect(need).toMatchObject({ status: 'answered', source: 'ai_call_agent', value: 'Missed calls; Coverage next month' });
    expect(need.transcriptRef).toEqual({ callRecordId: 'rec1', turnIndex: 1, startMs: 5000, quote: 'missed calls after hours' });
    expect(need.transcriptRefs).toHaveLength(2);
  });

  it('parses JSON defensively and validates corrections', () => {
    expect(parseExtraction('noise {"items":[{"category":"need"}]} trailing')).toHaveLength(1);
    expect(parseExtraction('not json')).toBeNull();
    expect(validateCorrection('timeline', { value: 'soon', normalized: 'later' })).toMatchObject({ ok: true, normalized: 'later' });
    expect(validateCorrection('timeline', { value: 'x', normalized: 'tomorrow-ish' }).ok).toBe(false);
    expect(normalizeWs('  a \n\t b ')).toBe('a b');
    const [system, user] = buildExtractionMessages(turns, { language: 'ur' });
    expect(system.content).toMatch(/UNTRUSTED DATA/);
    expect(user.content).toContain('[4] LEAD: Mera budget');
    expect(markConflicts([])).toEqual([]);
  });
});

const snapshot = {
  version: 3,
  entries: [
    { entryId: 'e1', type: 'pricing', title: 'Starter plan', content: 'Answering service for small shops.', price: { amount: 49000, currency: 'PKR', unit: 'month' }, allowedPromises: ['Setup within 48 hours'], forbiddenClaims: ['guaranteed more sales'], variants: [{ language: 'ur', title: 'اسٹارٹر پلان', content: 'چھوٹی دکانوں کے لیے' }] },
    { entryId: 'e2', type: 'promise', title: 'Free trial', content: '14-day free trial, cancel anytime' },
    { entryId: 'e3', type: 'faq', title: 'Contract length', content: 'Monthly, no long contract.' },
  ],
};

describe('approved knowledge + compliance', () => {
  it('builds a compact section from the published snapshot only, in the agent language', () => {
    const section = buildKnowledgeSection(snapshot, { language: 'ur' });
    expect(section).toMatch(/published version 3/);
    expect(section).toContain('اسٹارٹر پلان — 49,000 PKR per month');
    expect(section).toContain('Setup within 48 hours');
    expect(section).toContain('Never say or imply:\n- guaranteed more sales');
    expect(section).toMatch(/team member will follow up/);
    expect(buildKnowledgeSection({ version: 1, entries: [] })).toBeNull();
    expect(buildKnowledgeSection(snapshot, { maxChars: 300 }).length).toBeLessThanOrEqual(300);
  });

  it('extracts currency amounts in several notations and scripts', () => {
    expect(extractAmounts('It costs Rs. 49,000 per month').map(a => a.amount)).toEqual([49000]);
    expect(extractAmounts('only $1,234.50 or 2k dollars').map(a => a.amount)).toEqual([1234.5, 2000]);
    expect(extractAmounts('صرف ۴۹۰۰۰ روپے').map(a => a.amount)).toEqual([49000]);
    expect(extractAmounts('5 lakh rupees').map(a => a.amount)).toEqual([500000]);
    expect(extractAmounts('call me at 3 pm')).toEqual([]);
  });

  it('flags unapproved prices, promises and forbidden claims in AGENT turns only', () => {
    const transcript = [
      { role: 'assistant', text: 'The starter plan is 49,000 rupees a month.' },
      { role: 'assistant', text: 'For you I can do 39,000 PKR.' },
      { role: 'customer', text: 'Competitor offers 10,000 rupees and a guarantee.' },
      { role: 'assistant', text: 'We offer a 14-day free trial, cancel anytime.' },
      { role: 'assistant', text: 'We guarantee you will double your revenue.' },
      { role: 'assistant', text: 'This is guaranteed more sales for your shop.' },
    ];
    const flags = checkCompliance(transcript, snapshot);
    expect(flags.map(f => [f.kind, f.turnIndex])).toEqual([
      ['unapproved_price', 1], ['unapproved_promise', 4], ['forbidden_claim', 5], ['unapproved_promise', 5],
    ]);
    expect(checkCompliance(transcript.slice(0, 1), null).map(f => f.kind)).toEqual(['unapproved_price']);
  });

  it('diffs two versions by entry', () => {
    const next = { version: 4, entries: [{ ...snapshot.entries[0], price: { amount: 52000, currency: 'PKR', unit: 'month' } }, snapshot.entries[2], { entryId: 'e9', type: 'policy', title: 'Refunds', content: 'Pro-rata' }] };
    const d = diffKnowledgeVersions(snapshot, next);
    expect(d.added.map(e => e.entryId)).toEqual(['e9']);
    expect(d.removed.map(e => e.entryId)).toEqual(['e2']);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].fields.map(f => f.field)).toEqual(['price']);
  });
});

describe('transfer target selection', () => {
  const now = new Date('2026-10-29T10:30:00Z'); // Thursday, 15:30 in Karachi
  const presences = [
    { userId: 'u1', available: true, workingHours: { timezone: 'Asia/Karachi', days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '09:00', end: '18:00' }, phone: '+923001234567' },
    { userId: 'u2', available: true, workingHours: { timezone: 'Asia/Karachi', start: '18:00', end: '23:00' } },
    { userId: 'u3', available: false },
    { userId: 'u4', available: true },
    { userId: 'u5', available: true },
  ];
  it('keeps configured order and requires available + online + in hours + not busy', () => {
    const { eligible, skipped } = selectTransferTargets({
      targetUserIds: ['u5', 'u1', 'u2', 'u3', 'u4', 'u6', 'u1'], presences, online: new Set(['u1', 'u2', 'u3', 'u5']), busy: new Set(['u5']), now,
    });
    expect(eligible).toEqual([{ userId: 'u1', phone: '+923001234567' }]);
    expect(skipped).toEqual([
      { userId: 'u5', reason: 'busy' }, { userId: 'u2', reason: 'outside_working_hours' }, { userId: 'u3', reason: 'not_available' },
      { userId: 'u4', reason: 'offline' }, { userId: 'u6', reason: 'not_available' },
    ]);
  });
  it('handles overnight shifts, day lists and unknown time zones', () => {
    const night = { timezone: 'UTC', days: ['wed'], start: '22:00', end: '06:00' };
    expect(withinWorkingHours(night, new Date('2026-10-29T02:00:00Z'))).toBe(true); // Thu 02:00 belongs to Wed's shift
    expect(withinWorkingHours(night, new Date('2026-10-29T23:00:00Z'))).toBe(false); // Thu 23:00
    expect(withinWorkingHours(null)).toBe(true);
    expect(withinWorkingHours({ timezone: 'Not/AZone', start: '00:00', end: '23:59' }, now)).toBe(true);
  });
  it('scripts the fallback in the call language and clamps the ring time', () => {
    expect(fallbackScript('ur', { company: 'Updata' }).text).toContain('Updata');
    expect(fallbackScript('ur').language).toBe('ur');
    expect(fallbackScript('de-CH').language).toBe('de');
    expect(fallbackScript('auto').language).toBe('en');
    expect([clampTimeout(1), clampTimeout(1000), clampTimeout('x')]).toEqual([10, 120, 30]);
    expect(activeHandoffExemption(now).$or).toHaveLength(2);
  });
});
