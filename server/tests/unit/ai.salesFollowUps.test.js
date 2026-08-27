import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

/**
 * Which open quotations Sales AI puts on the list, and in what order.
 *
 * The client's own rule: the most valuable first, so the big deal is not the
 * one that slips while somebody chases a small one. The list is read from
 * real records — a follow-up list invented by a model is worthless — which is
 * why this runs against a database rather than a fixture.
 */
let Quotation, salesService;
const userId = new mongoose.Types.ObjectId();
const customerId = new mongoose.Types.ObjectId();
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const inDays = (n) => new Date(Date.now() + n * 86_400_000);

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/qop/department.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/qop/quotation.model.js');
  Quotation = mongoose.model('Quotation');
  ({ default: salesService } = await import('../../src/modules/ai/agents/sales/sales.service.js'));
});

beforeEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let counter = 0;
async function quotation({ value, sentAt, status = 'SENT', validUntil = inDays(30), title = 'Wärmepumpe' }) {
  counter += 1;
  return Quotation.create({
    quotationNumber: `OFF-2026-${String(1000 + counter)}`,
    customerId,
    customerName: 'Bäckerei Weber AG',
    title,
    status,
    sentAt,
    validUntil,
    grandTotalRounded: value,
    createdBy: userId,
    lineItems: [{ position: 1, type: 'material', description: title, vatRate: 8.1 }],
  });
}

describe('which quotations deserve a call', () => {
  test('one sent this morning is not chased', async () => {
    // Chasing the day after sending is how a firm becomes the one that pesters.
    await quotation({ value: 40000, sentAt: daysAgo(1) });
    expect(await salesService.findFollowUps()).toHaveLength(0);
  });

  test('one that has gone quiet for a week is', async () => {
    await quotation({ value: 40000, sentAt: daysAgo(9) });
    const list = await salesService.findFollowUps();
    expect(list).toHaveLength(1);
    expect(list[0].daysOpen).toBe(9);
  });

  test('a quotation that was answered is nobody\'s work any more', async () => {
    // Every state a quotation can be in except SENT. VIEWED is the one worth
    // arguing about — the customer opened it and said nothing — but chasing it
    // is a different conversation from chasing silence, and the agent is
    // deliberately narrow here.
    for (const status of ['DRAFT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CONVERTED']) {
      await quotation({ value: 40000, sentAt: daysAgo(30), status });
    }
    expect(await salesService.findFollowUps()).toHaveLength(0);
  });

  test('one sent without a date is judged on when it was last touched', async () => {
    // Imported or migrated quotations have no sentAt; ignoring them would
    // quietly drop a whole year of them off the list.
    const q = await quotation({ value: 12000, sentAt: null });
    await Quotation.updateOne({ _id: q._id }, { $set: { updatedAt: daysAgo(20) } }, { timestamps: false });
    expect(await salesService.findFollowUps()).toHaveLength(1);
  });
});

describe('the order is the client\'s own rule', () => {
  test('the most valuable comes first, whatever waited longest', async () => {
    await quotation({ value: 4_000, sentAt: daysAgo(60), title: 'Boilerersatz' });
    await quotation({ value: 90_000, sentAt: daysAgo(8), title: 'Erdsonde' });
    await quotation({ value: 20_000, sentAt: daysAgo(30), title: 'Luft-Wasser' });

    expect((await salesService.findFollowUps()).map((f) => f.value)).toEqual([90_000, 20_000, 4_000]);
  });

  test('at equal value, the one waiting longest comes first', async () => {
    await quotation({ value: 20_000, sentAt: daysAgo(10) });
    await quotation({ value: 20_000, sentAt: daysAgo(40) });

    expect((await salesService.findFollowUps()).map((f) => f.daysOpen)).toEqual([40, 10]);
  });

  test('the list is capped, and the cap keeps the valuable end', async () => {
    for (let i = 1; i <= 14; i += 1) await quotation({ value: i * 1000, sentAt: daysAgo(20) });
    const list = await salesService.findFollowUps({ limit: 5 });
    expect(list).toHaveLength(5);
    expect(list[0].value).toBe(14000);
  });
});

describe('what the office reads', () => {
  test('an empty list says so plainly rather than showing an empty table', async () => {
    expect(salesService.compose([])).toContain('nichts nachzufassen');
  });

  test('the total is stated, so the list is worth opening', async () => {
    await quotation({ value: 90_000, sentAt: daysAgo(8) });
    await quotation({ value: 10_000, sentAt: daysAgo(8) });
    const text = salesService.compose(await salesService.findFollowUps());

    expect(text).toContain('CHF 100000.00');
    expect(text).toMatch(/^2 offene Offerte/);
  });

  test('a quotation about to expire is marked, because that is the deadline', async () => {
    await quotation({ value: 50_000, sentAt: daysAgo(20), validUntil: inDays(3) });
    expect(salesService.compose(await salesService.findFollowUps())).toMatch(/läuft in 3 Tagen ab/);
  });

  test('one already expired says so rather than counting down', async () => {
    await quotation({ value: 50_000, sentAt: daysAgo(60), validUntil: daysAgo(5) });
    expect(salesService.compose(await salesService.findFollowUps())).toContain('abgelaufen');
  });

  test('it asks for the reason and forbids a discount on the spot', async () => {
    // Both are on this agent's forbidden list: it prepares the call, it does
    // not negotiate.
    await quotation({ value: 50_000, sentAt: daysAgo(20) });
    const text = salesService.compose(await salesService.findFollowUps());

    expect(text).toContain('Grund festhalten');
    expect(text).toContain('Keine Preiszugeständnisse ohne Rücksprache');
  });
});
