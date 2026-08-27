import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

/**
 * The ten things Money AI looks at before an invoice exists.
 *
 * An invoice is the one thing this system produces that a customer is held to,
 * and it is the hardest to take back: it carries a number, it is booked, and
 * it goes out with a payment slip. Every check below is a way an invoice can
 * be wrong in a way nobody notices until the customer calls.
 *
 * It runs against a database because the checks that matter — prices, open
 * reports, what is left to bill — are about the real record, not about what
 * the caller passed in. Money AI reloads the order itself for exactly that
 * reason: the context resolution hands it a short projection with no line
 * items, and judging money on that would block every invoice.
 */
let Order, WorkReport, moneyService;
const userId = new mongoose.Types.ObjectId();
const customerId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/site.model.js');
  await import('../../src/modules/qop/department.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/qop/order.model.js');
  await import('../../src/modules/qop/invoice.model.js');
  await import('../../src/modules/mobile/workReport.model.js');
  Order = mongoose.model('Order');
  WorkReport = mongoose.model('WorkReport');
  ({ default: moneyService } = await import('../../src/modules/ai/agents/money/money.service.js'));
});

beforeEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let counter = 0;
// An order line, as the record really is: no `type` — headings and notes do
// not survive the conversion from a quotation — and a VAT rate the schema
// requires.
const line = (over = {}) => ({
  position: 1, description: 'Wärmepumpe Hoval',
  quantity: 1, unitPrice: 24000, vatRate: 8.1, ...over,
});

async function order({ lineItems = [line()], status = 'CONFIRMED', total = 24000, currency = 'CHF' } = {}) {
  counter += 1;
  return Order.create({
    orderNumber: `AUF-2026-${String(1000 + counter)}`,
    customerId,
    customerName: 'Bäckerei Weber AG',
    title: 'Heizungsersatz',
    status,
    currency,
    lineItems,
    grandTotalRounded: total,
    createdBy: userId,
  });
}

const details = (checks) => checks.blockers.map((b) => b.detail).join(' | ');

describe('an invoice that can be raised', () => {
  test('a confirmed order with priced positions passes', async () => {
    const checks = await moneyService.checkBeforeInvoice(await order(), {
      customer: { street: 'Bahnhofstrasse 3', postalCode: '3011' },
    });

    expect(checks.ok).toBe(true);
    expect(checks.blockers).toEqual([]);
  });
});

describe('what stops an invoice', () => {
  test('a position without a price, named so the office can fix it', async () => {
    // The specification's own rule. A zero here becomes a zero on the bill.
    const checks = await moneyService.checkBeforeInvoice(await order({
      lineItems: [line(), line({ position: 2, description: 'Kernbohrung', unitPrice: 0 })],
    }));

    expect(checks.ok).toBe(false);
    expect(details(checks)).toContain('Kernbohrung');
  });

  test('every line on an order carries a price, so a zero is a zero', async () => {
    // The check used to exempt lines of type "text". An order line has no
    // type at all, so the exemption never applied — and a zero-priced line on
    // an order really is an unpriced position.
    const checks = await moneyService.checkBeforeInvoice(await order({
      lineItems: [line(), line({ position: 2, description: 'Bauseitige Leistungen', unitPrice: 0 })],
    }));

    expect(checks.ok).toBe(false);
    expect(details(checks)).toContain('Bauseitige Leistungen');
  });

  test('an order with nothing on it', async () => {
    const checks = await moneyService.checkBeforeInvoice(await order({ lineItems: [], total: 0 }));
    expect(details(checks)).toContain('keine Positionen');
  });

  test('a total of zero, even with positions', async () => {
    const checks = await moneyService.checkBeforeInvoice(await order({
      lineItems: [line({ unitPrice: 24000 })], total: 0,
    }));
    expect(details(checks)).toMatch(/Auftragswert beträgt 0/);
  });

  test('a work report nobody has released yet', async () => {
    // The client's own blocking rule: hours not signed off are hours that may
    // still change, and an invoice raised on them is one to credit back.
    const built = await order();
    await WorkReport.create({
      reportNumber: 'RAP-2026-0001',
      orderId: built._id,
      status: 'DRAFT',
      technicianId: userId,
      reportDate: new Date(),
      workPerformed: 'Wärmepumpe montiert.',
      createdBy: userId,
    });

    const checks = await moneyService.checkBeforeInvoice(built);
    expect(checks.ok).toBe(false);
    expect(details(checks)).toContain('RAP-2026-0001');
  });

  test('a released report does not stop anything', async () => {
    const built = await order();
    await WorkReport.create({
      reportNumber: 'RAP-2026-0002', orderId: built._id, status: 'APPROVED',
      technicianId: userId, reportDate: new Date(), workPerformed: 'Wärmepumpe montiert.', createdBy: userId,
    });

    expect((await moneyService.checkBeforeInvoice(built)).ok).toBe(true);
  });

  test('a cancelled order is not billable', async () => {
    const checks = await moneyService.checkBeforeInvoice(await order({ status: 'CANCELLED' }));
    expect(details(checks)).toContain('CANCELLED');
  });

  test('every state an order can really be in is judged', async () => {
    // The check once also named DRAFT, which an order cannot be: that is a
    // quotation's state, and an order starts at CONFIRMED.
    const { ORDER_STATUSES } = await import('../../src/modules/qop/order.model.js');
    expect(ORDER_STATUSES).not.toContain('DRAFT');
    for (const status of ORDER_STATUSES.filter((s2) => s2 !== 'CANCELLED')) {
      const checks = await moneyService.checkBeforeInvoice(await order({ status }), {
        customer: { street: 'Bahnhofstrasse 3' },
      });
      expect(checks.ok).toBe(true);
    }
  });
});

describe('what is worth saying without stopping the invoice', () => {
  test('a foreign currency is flagged, not refused', async () => {
    const checks = await moneyService.checkBeforeInvoice(await order({ currency: 'EUR' }), {
      customer: { street: 'Bahnhofstrasse 3' },
    });

    expect(checks.ok).toBe(true);
    expect(checks.warnings.join(' ')).toContain('EUR');
  });

  test('a zero VAT rate is a rate, not a missing one', async () => {
    // Exempt work is billed at 0 %. Warning about it would cry wolf on every
    // subsidised job.
    const checks = await moneyService.checkBeforeInvoice(await order({
      lineItems: [line({ vatRate: 0 })],
    }), { customer: { street: 'x' } });

    expect(checks.ok).toBe(true);
    expect(checks.warnings.join(' ')).not.toContain('MWST');
  });

  test('an order it could not read is said to be unverified, not declared clean', async () => {
    // Inventing an "all clear" is as wrong as inventing a blocker.
    const checks = await moneyService.checkBeforeInvoice({ _id: new mongoose.Types.ObjectId() });

    expect(checks.warnings.join(' ')).toContain('konnten nicht geprüft werden');
  });
});

describe('what the office reads when it is refused', () => {
  test('the message lists every blocker, not just the first', async () => {
    const checks = await moneyService.checkBeforeInvoice(await order({
      lineItems: [line({ unitPrice: 0 })], status: 'CANCELLED', total: 0,
    }));
    const out = moneyService.toBlocked('CREATE_INVOICE', checks);

    expect(out.status).toBe('blocked');
    expect(out.message).toContain('Die Rechnung wurde nicht erstellt');
    expect(out.blockers.length).toBeGreaterThan(1);
    for (const blocker of out.blockers) expect(out.message).toContain(blocker);
  });

  test('warnings are kept apart from what actually stopped it', async () => {
    const checks = await moneyService.checkBeforeInvoice(await order({
      lineItems: [line({ unitPrice: 0 })], currency: 'EUR',
    }));
    const out = moneyService.toBlocked('CREATE_INVOICE', checks);

    expect(out.message).toContain('Zusätzlich zu prüfen');
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});
