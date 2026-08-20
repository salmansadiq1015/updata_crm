/**
 * Money AI — outgoing invoices.
 *
 * The specification lists ten checks that must pass before an invoice is
 * drafted, and is explicit that the agent blocks when reports are still open
 * or a price is missing. It never sends and never sets a price itself.
 *
 * The checks run against real records, not against the model's opinion: an
 * invoice is money, and a hallucinated "everything is fine" is not acceptable.
 */
import mongoose from 'mongoose';
import { BLOCK_REASONS, blocked } from '../../governance/agent.risk.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/** Reports that still have to be approved before their work can be billed. */
async function openReportsForOrder(orderId) {
  if (!dbReady()) return [];
  try {
    const WorkReport = (await import('../../../mobile/workReport.model.js')).default;
    return WorkReport.find({
      orderId,
      status: { $nin: ['APPROVED', 'INVOICED'] },
    }).select('reportNumber status').limit(20).lean();
  } catch (err) {
    logger.warn('Money AI could not read the reports', {
      module: 'ai-money', action: 'openReports', error: err.message,
    });
    return [];
  }
}

/**
 * Quantity still open on the order, mirroring how the invoice service builds
 * its lines. Returns null when it cannot be determined, so an unknown never
 * becomes a block.
 */
async function remainingToInvoice(order) {
  if (!dbReady()) return null;
  try {
    const { default: invoiceRepository } = await import('../../../qop/invoice.repository.js');
    const invoices = await invoiceRepository.findByOrderId(order._id);
    if (!invoices?.length) return null;

    const billed = new Map();
    for (const invoice of invoices) {
      if (invoice.status === 'CANCELLED') continue;
      for (const line of invoice.lineItems || []) {
        const key = String(line.description || '').trim().toLowerCase();
        billed.set(key, (billed.get(key) || 0) + (Number(line.quantity) || 0));
      }
    }

    let open = 0;
    for (const line of order.lineItems || []) {
      if (line.type === 'text') continue;
      const key = String(line.description || '').trim().toLowerCase();
      open += Math.max(0, (Number(line.quantity) || 0) - (billed.get(key) || 0));
    }
    return open;
  } catch (err) {
    logger.warn('Money AI could not compute the remaining quantity', {
      module: 'ai-money', action: 'remainingToInvoice', error: err.message,
    });
    return null;
  }
}

class MoneyService {
  /**
   * The ten pre-invoice checks. Returns the blockers and the warnings
   * separately: a blocker stops the draft, a warning is worth saying out loud.
   */
  async checkBeforeInvoice(orderRef, { customer } = {}) {
    const blockers = [];
    const warnings = [];

    // Context resolution loads a short projection of the order — no line items,
    // no total, no invoice link. Checking money against that would block every
    // invoice, so read the record in full here rather than trust the caller.
    let order = orderRef;
    let verified = false;
    const orderId = orderRef?._id || orderRef?.id;
    if (orderId && dbReady()) {
      try {
        const Order = (await import('../../../qop/order.model.js')).default;
        const full = await Order.findById(orderId)
          .select('orderNumber customerId customerName status lineItems grandTotal grandTotalRounded currency invoiceId')
          .lean();
        if (full) { order = { ...orderRef, ...full }; verified = true; }
      } catch (err) {
        logger.warn('Money AI could not reload the order', {
          module: 'ai-money', action: 'checkBeforeInvoice', error: err.message,
        });
      }
    }

    // 1. Recipient — only judgeable on a record we actually read.
    if (verified && !order?.customerId && !customer) {
      blockers.push({ reason: BLOCK_REASONS.UNCLEAR_CUSTOMER, detail: 'Kein Rechnungsempfänger bestimmt.' });
    }
    // 2. Billing address
    const hasAddress = Boolean(customer?.street || customer?.postalCode || order?.customerName);
    if (!hasAddress) {
      warnings.push('Rechnungsadresse konnte nicht geprüft werden.');
    }
    // Checks 3 to 5 and 9 need the real line items. Without them the agent
    // cannot judge — and inventing a blocker is as wrong as inventing an "all
    // clear", so it says plainly that it could not verify.
    if (!verified) {
      warnings.push('Positionen und Beträge konnten nicht geprüft werden.');
    }

    // 3. Prices present
    const lineItems = verified ? (order?.lineItems || []) : [];
    const unpriced = lineItems.filter((item) => !item.unitPrice && item.type !== 'text');
    if (lineItems.length && unpriced.length) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_PRICE,
        detail: `${unpriced.length} Position(en) ohne Preis: ${unpriced.slice(0, 3).map((i) => i.description).join(', ')}.`,
      });
    }
    // 4. Something to bill at all
    if (verified && !lineItems.length) {
      blockers.push({ reason: BLOCK_REASONS.MISSING_REQUIRED_DATA, detail: 'Der Auftrag enthält keine Positionen.' });
    }
    // 5. Total plausible
    const total = order?.grandTotalRounded ?? order?.grandTotal ?? 0;
    if (lineItems.length && total <= 0) {
      blockers.push({ reason: BLOCK_REASONS.MISSING_PRICE, detail: 'Der Auftragswert beträgt 0.00 — Preise fehlen.' });
    }
    // 6. Reports closed — the specification's own blocking rule
    if (order?._id) {
      const open = await openReportsForOrder(order._id);
      if (open.length) {
        blockers.push({
          reason: BLOCK_REASONS.MISSING_APPROVAL,
          detail: `${open.length} Rapport(e) noch nicht freigegeben: ${open.slice(0, 3).map((r) => r.reportNumber).join(', ')}.`,
        });
      }
    }
    // 7. Order status plausible for billing
    if (order?.status && ['DRAFT', 'CANCELLED'].includes(order.status)) {
      blockers.push({
        reason: BLOCK_REASONS.CONTRADICTORY_DATA,
        detail: `Auftragsstatus ${order.status} — noch nicht verrechenbar.`,
      });
    }
    // 8. VAT set
    if (lineItems.length && lineItems.every((item) => item.vatRate === undefined || item.vatRate === null)) {
      warnings.push('Auf keiner Position ist ein MWST-Satz gesetzt.');
    }
    // 9. Already invoiced — checked against what is actually left to bill,
    //    because an order is invoiced line by line, not in one go.
    if (verified && order?._id && lineItems.length) {
      const remaining = await remainingToInvoice(order);
      if (remaining !== null && remaining <= 0) {
        blockers.push({
          reason: BLOCK_REASONS.CONTRADICTORY_DATA,
          detail: 'Der Auftrag ist bereits vollständig verrechnet — es bleibt keine offene Menge.',
        });
      }
    }
    // 10. Currency
    if (order?.currency && order.currency !== 'CHF') {
      warnings.push(`Fremdwährung ${order.currency} — bitte prüfen.`);
    }

    return { ok: blockers.length === 0, blockers, warnings };
  }

  /** The blocked outcome, in the shape every agent uses. */
  toBlocked(action, checks) {
    const first = checks.blockers[0];
    const lines = ['Die Rechnung wurde nicht erstellt:'];
    for (const blocker of checks.blockers) lines.push(`• ${blocker.detail}`);
    if (checks.warnings.length) {
      lines.push('');
      lines.push('Zusätzlich zu prüfen:');
      for (const warning of checks.warnings) lines.push(`• ${warning}`);
    }
    return {
      ...blocked(action, first.reason, { message: lines.join('\n') }),
      blockers: checks.blockers.map((b) => b.detail),
      warnings: checks.warnings,
    };
  }
}

export default new MoneyService();
