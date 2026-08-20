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
import { BLOCK_REASONS, blocked } from '../../governance/agent.risk.js';
import logger from '../../../../shared/logger/index.js';

/** Reports that still have to be approved before their work can be billed. */
async function openReportsForOrder(orderId) {
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
    const orderId = orderRef?._id || orderRef?.id;
    if (orderId) {
      try {
        const Order = (await import('../../../qop/order.model.js')).default;
        const full = await Order.findById(orderId)
          .select('orderNumber customerId customerName status lineItems grandTotal grandTotalRounded currency invoiceId')
          .lean();
        if (full) order = { ...orderRef, ...full };
      } catch (err) {
        logger.warn('Money AI could not reload the order', {
          module: 'ai-money', action: 'checkBeforeInvoice', error: err.message,
        });
      }
    }

    // 1. Recipient
    if (!order?.customerId && !customer) {
      blockers.push({ reason: BLOCK_REASONS.UNCLEAR_CUSTOMER, detail: 'Kein Rechnungsempfänger bestimmt.' });
    }
    // 2. Billing address
    const hasAddress = Boolean(customer?.street || customer?.postalCode || order?.customerName);
    if (!hasAddress) {
      warnings.push('Rechnungsadresse konnte nicht geprüft werden.');
    }
    // 3. Prices present
    const lineItems = order?.lineItems || [];
    const unpriced = lineItems.filter((item) => !item.unitPrice && item.type !== 'text');
    if (lineItems.length && unpriced.length) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_PRICE,
        detail: `${unpriced.length} Position(en) ohne Preis: ${unpriced.slice(0, 3).map((i) => i.description).join(', ')}.`,
      });
    }
    // 4. Something to bill at all
    if (!lineItems.length) {
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
    // 9. Already invoiced
    if (order?.invoiceId) {
      blockers.push({
        reason: BLOCK_REASONS.CONTRADICTORY_DATA,
        detail: 'Zu diesem Auftrag besteht bereits eine Rechnung.',
      });
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
