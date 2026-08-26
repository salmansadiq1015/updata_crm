import { describe, expect, test } from '@jest/globals';
import materialService from '../../src/modules/ai/agents/material/material.service.js';

/**
 * How Material AI pairs what a job needs with what was ordered.
 *
 * This system's purchase orders carry no project link, so the pairing is made
 * on the article number and, failing that, on the designation. Every failure
 * here has the same shape and the same cost: a part reported as covered when
 * it is not means a lorry arrives at a site that cannot start.
 */
function purchaseOrder(overrides = {}) {
  return {
    orderNumber: 'BE-2026-0007',
    supplierName: 'Tobler Haustechnik',
    status: 'sent',
    expectedDelivery: new Date('2026-09-10'),
    items: [],
    ...overrides,
  };
}

const WAERMEPUMPE = {
  articleNumber: 'WP-200',
  name: 'Wärmepumpe Hoval Belaria pro',
  quantity: 1,
  unit: 'STK',
};

describe('pairing a needed part with the order that covers it', () => {
  test('the article number decides, and the office is told so', () => {
    const cover = materialService._cover(WAERMEPUMPE, [purchaseOrder({
      items: [{ partNumber: 'WP-200', name: 'WP Belaria', quantity: 1, receivedQuantity: 0 }],
    })]);

    expect(cover).toMatchObject({
      purchaseOrderNumber: 'BE-2026-0007',
      supplier: 'Tobler Haustechnik',
      matchedBy: 'Artikelnummer',
      ordered: 1,
      received: 0,
    });
  });

  test("the supplier's own number counts as the article number", () => {
    // Wholesalers reorder under their own reference; the office writes ours.
    const cover = materialService._cover(WAERMEPUMPE, [purchaseOrder({
      items: [{ supplierPartNumber: 'wp-200', name: 'Etwas ganz anderes', quantity: 1 }],
    })]);

    expect(cover.matchedBy).toBe('Artikelnummer');
  });

  test('spacing and capitalisation in a part number do not break the pairing', () => {
    const cover = materialService._cover(
      { ...WAERMEPUMPE, articleNumber: ' wp-200 ' },
      [purchaseOrder({ items: [{ partNumber: 'WP-200', quantity: 1 }] })],
    );

    expect(cover).not.toBeNull();
  });

  test('a pairing made on the designation alone is marked as the assumption it is', () => {
    // The designation is the weaker signal, and the office has to be able to
    // see which pairings rest on it.
    const cover = materialService._cover(WAERMEPUMPE, [purchaseOrder({
      items: [{ partNumber: 'ANDERE-1', name: 'Wärmepumpe Hoval Belaria pro', quantity: 1 }],
    })]);

    expect(cover.matchedBy).toBe('Bezeichnung');
  });

  test('a different part with a similar name is not a pairing', () => {
    // "Wärmepumpe Hoval Belaria pro" and "Wärmepumpe Hoval Belaria dual" are
    // two machines and two prices; a loose match would report the wrong one
    // as covered.
    const cover = materialService._cover(WAERMEPUMPE, [purchaseOrder({
      items: [{ partNumber: 'WP-201', name: 'Wärmepumpe Hoval Belaria dual', quantity: 1 }],
    })]);

    expect(cover).toBeNull();
  });

  test('a part nobody ordered stays uncovered', () => {
    expect(materialService._cover(WAERMEPUMPE, [])).toBeNull();
    expect(materialService._cover(WAERMEPUMPE, [purchaseOrder({ items: [] })])).toBeNull();
  });

  test('a part-numberless article can still be paired by name', () => {
    // Free-text positions have no article number at all; falling back to the
    // designation is the only thing left.
    const cover = materialService._cover(
      { articleNumber: null, name: 'Ausdehnungsgefäss 25 l', quantity: 1, unit: 'STK' },
      [purchaseOrder({ items: [{ name: 'Ausdehnungsgefäss 25 l', quantity: 1 }] })],
    );

    expect(cover.matchedBy).toBe('Bezeichnung');
  });

  test('what was delivered is reported separately from what was ordered', () => {
    // Ten radiators ordered, six on the lorry: the job cannot start on six.
    const cover = materialService._cover(
      { articleNumber: 'HK-10', name: 'Heizkörper', quantity: 10, unit: 'STK' },
      [purchaseOrder({
        status: 'partial',
        items: [{ partNumber: 'HK-10', quantity: 10, receivedQuantity: 6 }],
      })],
    );

    expect(cover).toMatchObject({ status: 'partial', ordered: 10, received: 6 });
  });

  test('a missing delivery figure reads as nothing delivered, never as all of it', () => {
    const cover = materialService._cover(WAERMEPUMPE, [purchaseOrder({
      items: [{ partNumber: 'WP-200', quantity: 1 }],
    })]);

    expect(cover.received).toBe(0);
  });

  test('the first order that matches is the one reported', () => {
    // Reordered after a breakage: two orders carry the part, and reporting the
    // second would hide the delivery already booked on the first.
    const cover = materialService._cover(WAERMEPUMPE, [
      purchaseOrder({ orderNumber: 'BE-2026-0001', items: [{ partNumber: 'WP-200', quantity: 1, receivedQuantity: 1 }] }),
      purchaseOrder({ orderNumber: 'BE-2026-0009', items: [{ partNumber: 'WP-200', quantity: 1 }] }),
    ]);

    expect(cover.purchaseOrderNumber).toBe('BE-2026-0001');
  });

  test('an order without a delivery date still counts as an order', () => {
    // It is worth a warning, not a denial — the part is on its way.
    const cover = materialService._cover(WAERMEPUMPE, [purchaseOrder({
      expectedDelivery: null,
      items: [{ partNumber: 'WP-200', quantity: 1 }],
    })]);

    expect(cover).not.toBeNull();
    expect(cover.expectedDelivery).toBeNull();
  });
});
