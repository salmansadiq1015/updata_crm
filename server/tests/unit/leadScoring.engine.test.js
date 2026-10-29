import { describe, expect, it } from '@jest/globals';
import {
  scoreLead, normalizeScoringConfig, bandFor, toStoredScore, DEFAULT_SCORING_CONFIG, FACTOR_DEFINITIONS, ENGINE_VERSION,
} from '../../src/modules/crm/leadScoring.engine.js';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);

const answered = (fieldKey, value, extra = {}) => ({
  fieldKey, value, status: 'answered', source: 'user', evidence: `said ${value}`, communicationId: 'c'.repeat(24), updatedAt: daysAgo(2), ...extra,
});

function richLead() {
  return {
    _id: 'a'.repeat(24),
    source: 'google_places',
    name: 'Acme Heating',
    phone: '+41 44 123 45 67',
    email: 'info@acme.ch',
    website: 'https://acme.ch',
    providerMeta: { rating: 4.7, reviewCount: 150, businessStatus: 'OPERATIONAL' },
    sourceMetadata: { businessType: 'Plumber', discoveredAt: daysAgo(30) },
    address: { city: 'Zürich' },
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
    lastContactedAt: daysAgo(3),
    qualification: {
      fields: [
        answered('need', 'New boiler'),
        answered('budget', 12000),
        answered('decision_authority', 'decision_maker'),
        answered('timeline', 'immediate'),
        answered('interest', 'high'),
        answered('objections', 'none'),
      ],
    },
  };
}

const richSignals = () => ({
  communications: [
    { id: 'm1', channel: 'phone', connected: 'yes', disposition: 'interested', doNotContact: false, at: daysAgo(3) },
    { id: 'm0', channel: 'phone', connected: 'yes', disposition: 'callback_requested', doNotContact: false, at: daysAgo(10) },
  ],
  calls: [],
  smsReplies: [{ id: 's1', at: daysAgo(4) }, { id: 's2', at: daysAgo(5) }],
  smsSent: 3,
  dnc: [],
});

const factor = (result, key) => result.factors.find((f) => f.key === key);
const missingKeys = (result) => result.missing.map((m) => m.key);

describe('leadScoring engine — determinism + version stamping', () => {
  it('is deterministic for the same inputs and does not read the clock', () => {
    const a = scoreLead(richLead(), richSignals(), DEFAULT_SCORING_CONFIG, { now: NOW });
    const b = scoreLead(richLead(), richSignals(), DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.computedAt).toBe(NOW.toISOString());
  });

  it('keeps factor order fixed regardless of signal order', () => {
    const signals = richSignals();
    const reversed = { ...signals, communications: [...signals.communications].reverse(), smsReplies: [...signals.smsReplies].reverse() };
    const a = scoreLead(richLead(), signals, DEFAULT_SCORING_CONFIG, { now: NOW });
    const b = scoreLead(richLead(), reversed, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(b).toEqual(a);
    expect(a.factors.map((f) => f.key)).toEqual(FACTOR_DEFINITIONS.map((f) => f.key).filter((k) => a.factors.some((f) => f.key === k)));
  });

  it('stamps the config version and the engine version', () => {
    const result = scoreLead(richLead(), richSignals(), { ...DEFAULT_SCORING_CONFIG, version: 7 }, { now: NOW });
    expect(result.version).toBe(7);
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    const stored = toStoredScore(result);
    expect(stored).toMatchObject({ value: result.score, band: result.band, version: 7, engineVersion: ENGINE_VERSION });
    expect(stored.factors[0]).toEqual({ key: stored.factors[0].key, points: expect.any(Number), maxPoints: expect.any(Number) });
    expect(stored.factors[0].evidence).toBeUndefined();
  });

  it('scores a fully evidenced lead hot and reaches 100 with every factor maxed', () => {
    const result = scoreLead(richLead(), richSignals(), DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(result.score).toBe(100);
    expect(result.band).toBe('hot');
    expect(result.disqualified).toBe(false);
    // Business type / target city are not applicable without configured targets.
    expect(factor(result, 'business_type_match')).toBeUndefined();
    expect(missingKeys(result)).not.toContain('business_type_match');
  });
});

describe('leadScoring engine — business factors', () => {
  it('tiers the provider rating and review volume with evidence', () => {
    const lead = { ...richLead(), providerMeta: { rating: 4.1, reviewCount: 25, businessStatus: 'OPERATIONAL' } };
    const r = scoreLead(lead, {}, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(r, 'provider_rating')).toMatchObject({ points: 7, maxPoints: 10, evidence: { field: 'providerMeta.rating', value: 4.1, source: 'provider' } });
    expect(factor(r, 'review_volume')).toMatchObject({ points: 3, maxPoints: 5 });
  });

  it('gives no points for a closed business and reports an unrecognised status honestly', () => {
    const closed = scoreLead({ ...richLead(), providerMeta: { businessStatus: 'CLOSED_PERMANENTLY' } }, {}, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(closed, 'business_status').points).toBe(0);
    const odd = scoreLead({ ...richLead(), providerMeta: { businessStatus: 'Seasonal' } }, {}, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(odd, 'business_status').evidence.note).toBe('unrecognised_status');
  });

  it('scores contact channels present', () => {
    const r = scoreLead({ _id: 'x', mobile: '079', email: null, website: '' }, {}, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(r, 'has_phone')).toMatchObject({ points: 4, evidence: { field: 'mobile' } });
    expect(missingKeys(r)).toEqual(expect.arrayContaining(['has_email', 'has_website']));
  });

  it('matches business type and target city case/accent-insensitively when configured', () => {
    const cfg = { ...DEFAULT_SCORING_CONFIG, targetBusinessTypes: ['plumber'], targetCities: ['zurich'] };
    const r = scoreLead(richLead(), {}, cfg, { now: NOW });
    expect(factor(r, 'business_type_match')).toMatchObject({ points: 5, evidence: { value: 'Plumber' } });
    expect(factor(r, 'target_location')).toMatchObject({ points: 5, evidence: { value: 'Zürich' } });
    const miss = scoreLead({ ...richLead(), address: { city: 'Bern' } }, {}, cfg, { now: NOW });
    expect(factor(miss, 'target_location').points).toBe(0);
  });
});

describe('leadScoring engine — qualification factors', () => {
  it('maps choice answers through the configured tables and cites the answer evidence', () => {
    const lead = richLead();
    lead.qualification.fields = [
      answered('decision_authority', 'influencer'),
      answered('timeline', 'within_6_months', { callRecordId: 'd'.repeat(24) }),
      answered('interest', 'medium'),
    ];
    const r = scoreLead(lead, {}, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(r, 'q_decision_authority').points).toBe(3.5);
    expect(factor(r, 'q_timeline')).toMatchObject({ points: 2.8, evidence: { ref: { type: 'call_record', id: 'd'.repeat(24) } } });
    expect(factor(r, 'q_interest')).toMatchObject({
      points: 5.4,
      evidence: { field: 'qualification.fields.interest', value: 'medium', source: 'user', ref: { type: 'lead_communication' }, quote: 'said medium' },
    });
    expect(missingKeys(r)).toEqual(expect.arrayContaining(['q_need', 'q_budget', 'q_objections']));
  });

  it('gives zero (not missing) for refused / unknown answers and penalises real objections', () => {
    const lead = richLead();
    lead.qualification.fields = [
      { fieldKey: 'budget', value: null, status: 'refused', source: 'user', updatedAt: daysAgo(1) },
      answered('objections', 'Too expensive'),
    ];
    const r = scoreLead(lead, {}, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(r, 'q_budget')).toMatchObject({ points: 0, evidence: { value: 'refused' } });
    expect(factor(r, 'q_objections')).toMatchObject({ points: -3, maxPoints: 0, minPoints: -3 });
  });
});

describe('leadScoring engine — engagement factors', () => {
  it('counts connected mobile calls and AI calls, latest evidence first', () => {
    const r = scoreLead({ _id: 'x' }, {
      communications: [{ id: 'm1', channel: 'phone', connected: 'no', disposition: 'no_answer', at: daysAgo(1) }],
      calls: [{ id: 'c1', disposition: 'answered_partial', answeredAt: daysAgo(2), at: daysAgo(2) }],
    }, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(r, 'connected_calls')).toMatchObject({ points: 6, evidence: { value: 1, source: 'ai_call', ref: { type: 'call_record', id: 'c1' } } });
  });

  it('reports attempted-but-unconnected calls as zero with evidence, not as missing', () => {
    const r = scoreLead({ _id: 'x' }, { communications: [{ id: 'm1', channel: 'phone', connected: 'no', disposition: 'no_answer', at: daysAgo(1) }] }, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(r, 'connected_calls')).toMatchObject({ points: 0, evidence: { note: 'attempted_not_connected' } });
  });

  it('uses the most recent business outcome only', () => {
    const r = scoreLead({ _id: 'x' }, {
      communications: [
        { id: 'new', channel: 'phone', connected: 'yes', disposition: 'not_interested', at: daysAgo(1) },
        { id: 'old', channel: 'phone', connected: 'yes', disposition: 'interested', at: daysAgo(9) },
        { id: 'sms', channel: 'sms', connected: 'unknown', disposition: 'sent', at: daysAgo(0) },
      ],
    }, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(r, 'positive_outcome')).toMatchObject({ points: 0, evidence: { value: 'not_interested', ref: { id: 'new' } } });
  });

  it('decays contact recency by the configured tiers', () => {
    const at = (d) => scoreLead({ _id: 'x', lastContactedAt: daysAgo(d) }, {}, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(at(2), 'contact_recency').points).toBe(5);
    expect(factor(at(20), 'contact_recency').points).toBe(3);
    expect(factor(at(60), 'contact_recency').points).toBe(1.5);
    expect(factor(at(200), 'contact_recency').points).toBe(0);
    expect(factor(at(20), 'contact_recency').evidence.value).toBe('20d');
  });

  it('counts SMS replies', () => {
    const r = scoreLead({ _id: 'x' }, { smsReplies: [{ id: 's1', at: daysAgo(1) }] }, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(factor(r, 'sms_replies')).toMatchObject({ points: 4.2, evidence: { ref: { type: 'sim_sms_message', id: 's1' } } });
  });
});

describe('leadScoring engine — do-not-contact + missing data', () => {
  it('disqualifies on any recorded do-not-contact, citing the record', () => {
    const r = scoreLead(richLead(), { ...richSignals(), dnc: [{ source: 'call_suppression:call_request', at: daysAgo(1), ref: { type: 'call_suppression', id: 'z1' } }] }, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(r).toMatchObject({ score: 0, band: 'cold', disqualified: true });
    expect(r.factors[0]).toMatchObject({ key: 'do_not_contact', evidence: { ref: { type: 'call_suppression', id: 'z1' } } });
  });

  it('handles an empty lead: everything missing, unscored, no exceptions', () => {
    const r = scoreLead({ _id: 'x' }, {}, DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(r.score).toBe(0);
    expect(r.band).toBe('unscored');
    expect(r.factors).toEqual([]);
    expect(missingKeys(r)).toEqual(expect.arrayContaining(['provider_rating', 'q_need', 'connected_calls', 'contact_recency']));
    expect(r.missing.every((m) => typeof m.reason === 'string')).toBe(true);
  });

  it('treats missing data as zero points (never estimated) and lowers the score', () => {
    const lead = richLead();
    delete lead.providerMeta;
    const r = scoreLead(lead, richSignals(), DEFAULT_SCORING_CONFIG, { now: NOW });
    expect(missingKeys(r)).toEqual(expect.arrayContaining(['provider_rating', 'review_volume', 'business_status']));
    expect(r.score).toBe(78); // 70 of 90 applicable points
  });
});

describe('leadScoring config', () => {
  it('normalizes partial configs onto the defaults and clamps warm <= hot', () => {
    const cfg = normalizeScoringConfig({ bands: { hot: 50, warm: 80 }, factors: { provider_rating: { enabled: false } } });
    expect(cfg.bands).toEqual({ hot: 50, warm: 50 });
    expect(cfg.factors.provider_rating).toEqual({ enabled: false, maxPoints: 10 });
    expect(cfg.factors.q_interest).toEqual({ enabled: true, maxPoints: 9 });
  });

  it('honours weights: a disabled factor neither earns nor counts toward the maximum', () => {
    const base = scoreLead({ _id: 'x', email: 'a@b.ch', phone: '1' }, {}, { ...DEFAULT_SCORING_CONFIG, minEvidence: 0 }, { now: NOW });
    const off = scoreLead({ _id: 'x', email: 'a@b.ch', phone: '1' }, {}, { ...DEFAULT_SCORING_CONFIG, minEvidence: 0, factors: { has_email: { enabled: false } } }, { now: NOW });
    expect(factor(off, 'has_email')).toBeUndefined();
    expect(off.score).not.toBe(base.score);
  });

  it('bands by thresholds and minimum evidence', () => {
    const cfg = normalizeScoringConfig({});
    expect(bandFor(75, cfg, { evidenced: 5 })).toBe('hot');
    expect(bandFor(45, cfg, { evidenced: 5 })).toBe('warm');
    expect(bandFor(10, cfg, { evidenced: 5 })).toBe('cold');
    expect(bandFor(90, cfg, { evidenced: 1 })).toBe('unscored');
  });
});
