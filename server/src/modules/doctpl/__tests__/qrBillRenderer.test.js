import {
  afterEach, beforeEach, describe, expect, test,
} from '@jest/globals';
import QrBillRenderer from '../renderer/renderers/QrBillRenderer.js';
import { __qrCalls, __attachCalls, __resetQrMock } from '../../../../tests/mocks/swissqrbill.js';

beforeEach(() => __resetQrMock());
afterEach(() => __resetQrMock());

const ciConfig = {
  companyName: 'Updata',
  companyDetails: { address: { street: 'Bahnhofstrasse 1', zip: '3000', city: 'Bern' } },
};

function qrData() {
  return {
    iban: 'CH4431999123000889012',
    amount: 1081.5,
    currency: 'CHF',
    reference: '210000000003139471430009017',
    debtor: { name: 'Muster AG', address: 'Bahnhofstrasse 1', zip: '8001', city: 'Zürich', country: 'CH' },
    message: 'RE-2026-0001',
  };
}

describe('QrBillRenderer payload assembly (DOC-003)', () => {
  test('maps QR data and creditor onto the SIX bill structure and attaches it', async () => {
    const doc = { id: 'doc' };
    await new QrBillRenderer().draw(doc, {}, ciConfig, { qrBill: qrData() }, 'de');

    expect(__qrCalls).toHaveLength(1);
    const { data, opts } = __qrCalls[0];
    expect(data.creditor.account).toBe('CH4431999123000889012');
    expect(data.creditor.name).toBe('Updata');
    expect(data.amount).toBe(1081.5);
    expect(data.currency).toBe('CHF');
    expect(data.reference).toBe('210000000003139471430009017');
    expect(data.debtor.name).toBe('Muster AG');
    expect(opts.language).toBe('DE');
    expect(__attachCalls).toContain(doc);
  });

  test('maps the document language to the QR-bill language code', async () => {
    await new QrBillRenderer().draw({}, {}, ciConfig, { qrBill: qrData() }, 'fr');
    expect(__qrCalls[0].opts.language).toBe('FR');
  });

  test('a reference that is already a valid QR reference is left alone', async () => {
    // Deriving from a valid QRR produced a different, also valid, reference —
    // and the customer then paid against a number no invoice carries.
    await new QrBillRenderer().draw({}, {}, ciConfig, { qrBill: qrData() }, 'de');
    expect(__qrCalls[0].data.reference).toBe('210000000003139471430009017');
  });

  test('a document number on a QR-IBAN becomes a compliant 27-digit reference', async () => {
    // A quotation number is not a QR reference, and a QR-IBAN accepts nothing
    // else — so one is derived rather than the slip going out non-compliant.
    await new QrBillRenderer().draw(
      {}, {}, ciConfig,
      { qrBill: { ...qrData(), reference: 'RE-2026-0001' } },
      'de',
    );

    const { reference } = __qrCalls[0].data;
    expect(reference).toMatch(/^\d{27}$/);
    expect(reference).not.toBe('RE-2026-0001');
  });

  test('does nothing when no IBAN is present (non-invoice documents)', async () => {
    await new QrBillRenderer().draw({}, {}, ciConfig, { qrBill: { amount: 100 } }, 'de');
    expect(__qrCalls).toHaveLength(0);
    expect(__attachCalls).toHaveLength(0);
  });
});
