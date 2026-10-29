import { describe, expect, it } from '@jest/globals';
import {
  maskPhone, maskEmail, redactText, maskSensitive, looksLikePhone, isMaskedValue,
} from '../../src/shared/security/fieldMasking.js';
import { assertTenancySupported, TENANCY_ERROR } from '../../src/config/tenancyGuard.js';
import { getGovernanceSettings } from '../../src/shared/security/governanceSettings.js';
import { computeAttribution, creditShares, convertBag } from '../../src/modules/analytics/attribution.engine.js';
import { evaluateLeadVisibility } from '../../src/modules/governance/leadAccess.js';
import { describeAccess } from '../../src/modules/governance/governance.middleware.js';
import { satisfiesPermission } from '../../src/shared/middleware/authenticate.js';

describe('fieldMasking', () => {
  it('masks phones keeping the country code and last four digits', () => {
    expect(maskPhone('+92 300 1230305')).toBe('+92 *** ***0305');
    expect(maskPhone('+41 79 765 43 21')).toBe('+41 *** ***4321');
    expect(maskPhone('0041 44 123 45 67')).toBe('+41 *** ***4567');
    expect(maskPhone('044 123 45 67')).toBe('*** ***4567');
    expect(maskPhone('12')).toBe('***');
    expect(isMaskedValue(maskPhone('+41 79 765 43 21'))).toBe(true);
  });

  it('masks e-mail local parts', () => {
    expect(maskEmail('john.doe@domain.com')).toBe('j***@domain.com');
  });

  it('never treats dates, ids or short codes as phone numbers', () => {
    expect(looksLikePhone('2026-10-01')).toBe(false);
    expect(looksLikePhone('L-00012')).toBe(false);
    expect(looksLikePhone('6ae34e2e3914abafcb5a9b5b')).toBe(false);
    expect(looksLikePhone('+41 79 765 43 21')).toBe(true);
  });

  it('redacts numbers and addresses embedded in free text, keeping the wording', () => {
    expect(redactText('Call me on +41 79 765 43 21 or mail anna@firma.ch tomorrow'))
      .toBe('Call me on +41 *** ***4321 or mail a***@firma.ch tomorrow');
  });

  it('masks recursively, flags masked objects, drops recording refs and leaves staff refs alone', () => {
    const input = {
      lead: {
        name: 'Acme', phone: '+41 44 123 45 67', email: 'info@acme.ch', address: { city: 'Zürich' },
        createdBy: { email: 'agent@company.ch' },
      },
      call: { recordingRef: 's3://rec/1.ogg', transcript: [{ role: 'customer', text: 'my number is 079 765 43 21' }] },
      from: '2026-10-01',
    };
    const out = maskSensitive(input);
    expect(out.lead).toMatchObject({ phone: '+41 *** ***4567', email: 'i***@acme.ch', piiMasked: true, address: { city: 'Zürich' } });
    expect(out.lead.createdBy.email).toBe('agent@company.ch');
    expect(out.call.recordingRef).toBeNull();
    expect(out.call.transcript[0].text).toBe('my number is *** ***4321');
    expect(out.from).toBe('2026-10-01');
    expect(input.lead.phone).toBe('+41 44 123 45 67'); // never mutates
  });
});

describe('tenancy guard', () => {
  it('refuses MULTI_TENANT_MODE=true and accepts the default', () => {
    expect(() => assertTenancySupported({ MULTI_TENANT_MODE: 'true' })).toThrow(TENANCY_ERROR);
    expect(() => assertTenancySupported({ MULTI_TENANT_MODE: true })).toThrow('tenant isolation is not implemented');
    expect(() => assertTenancySupported({ MULTI_TENANT_MODE: 'false' })).not.toThrow();
    expect(() => assertTenancySupported({})).not.toThrow();
  });
});

describe('governance settings', () => {
  it('defaults preserve existing behaviour', () => {
    expect(getGovernanceSettings({})).toMatchObject({
      leadAccessMode: 'company', teamMode: false, piiMaskingEnabled: false, simSmsCostPerMessage: null, accessGrantMinutes: 30,
    });
    expect(getGovernanceSettings({ LEAD_ACCESS_MODE: 'team', PII_MASKING_ENABLED: 'true', SIM_SMS_COST_PER_MESSAGE: '0.08' }))
      .toMatchObject({ teamMode: true, piiMaskingEnabled: true, simSmsCostPerMessage: 0.08 });
  });
});

describe('permissions', () => {
  it('user administrators manage teams; CRM admins read attribution', () => {
    expect(satisfiesPermission(['users:admin'], 'team:manage')).toBe(true);
    expect(satisfiesPermission(['team:manage'], 'team:read')).toBe(true);
    expect(satisfiesPermission(['crm:admin'], 'analytics:attribution:read')).toBe(true);
    expect(satisfiesPermission(['crm:admin'], 'ai-calling:admin')).toBe(true); // unchanged
    expect(satisfiesPermission(['lead:read'], 'lead:pii:view')).toBe(false);
    expect(satisfiesPermission(['lead:read'], 'lead:read:all')).toBe(false);
  });
});

describe('lead visibility', () => {
  const scope = { unrestricted: false, userId: 'u1', supervisedUserIds: ['u2'], pools: [{ sources: ['import'] }] };
  it('own, supervised, pooled, foreign', () => {
    expect(evaluateLeadVisibility(scope, { createdBy: 'u1' })).toEqual({ visible: true, own: true });
    expect(evaluateLeadVisibility(scope, { createdBy: 'x', assignedTo: 'u1' })).toEqual({ visible: true, own: true });
    expect(evaluateLeadVisibility(scope, { createdBy: 'x', assignedTo: 'u2' })).toEqual({ visible: true, own: false });
    expect(evaluateLeadVisibility(scope, { createdBy: 'x', assignedTo: null, source: 'import' })).toEqual({ visible: true, own: false });
    expect(evaluateLeadVisibility(scope, { createdBy: 'x', assignedTo: null, source: 'manual' })).toEqual({ visible: false, own: false });
    expect(evaluateLeadVisibility(scope, { createdBy: 'x', assignedTo: 'u9' })).toEqual({ visible: false, own: false });
  });
  it('names audited actions', () => {
    expect(describeAccess('aiCall', 'GET')).toBe('transcript.read');
    expect(describeAccess('aiCall', 'POST', 'monitor')).toBe('call.listen');
    expect(describeAccess('lead', 'GET', 'communications')).toBe('conversation.view');
    expect(describeAccess('lead', 'PATCH')).toBe('lead.modify');
  });
});

describe('attribution engine', () => {
  const day = (d) => new Date(`2026-10-${String(d).padStart(2, '0')}T10:00:00Z`);
  const touches = [
    { leadId: 'A', at: day(1), channel: 'ai_call', campaignKey: 'c1', campaignName: 'AI wave', agentKey: 'ai_agent:1', cost: { amount: 2, currency: 'CHF' } },
    { leadId: 'A', at: day(3), channel: 'sim_sms', campaignKey: 'c2', campaignName: 'SMS wave', agentKey: 'user:1', cost: null },
    { leadId: 'B', at: day(2), channel: 'ai_call', campaignKey: 'c1', campaignName: 'AI wave', agentKey: 'ai_agent:1', cost: { amount: 4, currency: 'USD' } },
    { leadId: 'C', at: day(5), channel: 'sim_sms', campaignKey: 'c2', campaignName: 'SMS wave', agentKey: 'user:1', cost: null },
  ];
  const leads = new Map([
    ['A', { qualified: true, converted: true, convertedAt: day(4) }],
    ['B', { qualified: true, converted: false }],
    ['C', { qualified: true, converted: true, convertedAt: day(4) }], // touched only after conversion
  ]);
  const revenue = new Map([['A', { CHF: 1000 }]]);

  it('credit shares per model', () => {
    const ordered = touches.filter((t) => t.leadId === 'A');
    expect([...creditShares(ordered, 'first', 'campaign')]).toEqual([['c1', 1]]);
    expect([...creditShares(ordered, 'last', 'campaign')]).toEqual([['c2', 1]]);
    expect([...creditShares(ordered, 'linear', 'campaign')]).toEqual([['c1', 0.5], ['c2', 0.5]]);
  });

  it('only converts currencies with a recorded rate', () => {
    expect(convertBag({ CHF: 2, USD: 4 }, 'CHF', new Map([['USD>CHF', 0.9]]))).toEqual({ amount: 5.6, missing: [] });
    expect(convertBag({ CHF: 2, USD: 4 }, 'CHF', new Map())).toEqual({ amount: 2, missing: ['USD'] });
  });

  it('linear attribution with recorded spend, revenue and honest exclusions', () => {
    const r = computeAttribution({
      touches, leads, revenue, rates: new Map([['USD>CHF', 0.9]]), groupBy: 'campaign', model: 'linear', currency: 'CHF',
    });
    const c1 = r.rows.find((x) => x.key === 'c1');
    const c2 = r.rows.find((x) => x.key === 'c2');
    expect(c1).toMatchObject({ spend: 5.6, leadsTouched: 2, qualifiedCredit: 1.5, convertedCredit: 0.5, revenue: 500, profit: 494.4 });
    expect(c1.costPerQualifiedLead).toBe(3.73);
    expect(c1.costPerConversion).toBe(11.2);
    expect(c2).toMatchObject({ spend: 0, revenue: 500, convertedCredit: 0.5 });
    expect(c2.excluded.touchesCostNotRecorded).toBe(2);
    expect(r.totals).toMatchObject({ leadsTouched: 3, qualifiedCredit: 2, convertedCredit: 1, revenue: 1000, spend: 5.6 });
    expect(r.excluded.leadsTouchedOnlyAfterConversion).toBe(1);
  });

  it('without a recorded exchange rate, spend and profit are not computed (never estimated)', () => {
    const r = computeAttribution({ touches, leads, revenue, groupBy: 'campaign', model: 'first', currency: 'CHF' });
    const c1 = r.rows.find((x) => x.key === 'c1');
    expect(c1.spend).toBeNull();
    expect(c1.profit).toBeNull();
    expect(c1.excluded.currenciesWithoutRate).toEqual(['USD']);
  });

  it('converted leads without recorded revenue are counted, not estimated', () => {
    const r = computeAttribution({ touches, leads, revenue: new Map(), groupBy: 'channel', model: 'first', currency: 'CHF', rates: new Map([['USD>CHF', 1]]) });
    const ai = r.rows.find((x) => x.key === 'ai_call');
    expect(ai.revenue).toBeNull();
    expect(ai.profit).toBeNull();
    expect(ai.excluded.conversionsRevenueNotRecorded).toBe(1);
  });
});
