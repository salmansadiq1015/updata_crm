/**
 * Sales AI — keeps open quotations from going quiet.
 *
 * The specification asks it to watch quotations that have been sent, work out
 * when to follow up, and order the work by what it is worth, so the biggest
 * deal is not the one that slips. It drafts the follow-up; it never applies
 * pressure and never offers a discount — both are on its forbidden list.
 */
import mongoose from 'mongoose';
import logger from '../../../../shared/logger/index.js';

/** After this long without an answer, a quotation is worth chasing. */
const DEFAULT_FOLLOW_UP_DAYS = 7;

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

class SalesService {
  /**
   * Open quotations that deserve a call, most valuable first.
   * Reads real records — a follow-up list invented by a model is worthless.
   */
  async findFollowUps({ minDays = DEFAULT_FOLLOW_UP_DAYS, limit = 10 } = {}) {
    if (mongoose.connection?.readyState !== 1) return [];
    try {
      const Quotation = (await import('../../../qop/quotation.model.js')).default;
      const cutoff = new Date(Date.now() - minDays * 86_400_000);

      const quotations = await Quotation.find({
        status: 'SENT',
        $or: [{ sentAt: { $lte: cutoff } }, { sentAt: null, updatedAt: { $lte: cutoff } }],
      })
        .select('quotationNumber title customerName grandTotalRounded grandTotal sentAt validUntil updatedAt')
        .limit(50)
        .lean();

      return quotations
        .map((q) => ({
          id: q._id,
          quotationNumber: q.quotationNumber,
          title: q.title || '',
          customerName: q.customerName || '',
          value: q.grandTotalRounded ?? q.grandTotal ?? 0,
          daysOpen: daysSince(q.sentAt || q.updatedAt),
          expiresInDays: q.validUntil ? daysSince(q.validUntil) * -1 : null,
        }))
        // Worth first, then the longest waiting — the client's own rule.
        .sort((a, b) => (b.value - a.value) || (b.daysOpen - a.daysOpen))
        .slice(0, limit);
    } catch (err) {
      logger.warn('Sales AI could not read the open quotations', {
        module: 'ai-sales', action: 'findFollowUps', error: err.message,
      });
      return [];
    }
  }

  /** The list as the office reads it, with what to say on the phone. */
  compose(followUps) {
    if (!followUps.length) {
      return 'Zurzeit ist keine Offerte überfällig — es gibt nichts nachzufassen.';
    }
    const total = followUps.reduce((sum, f) => sum + (f.value || 0), 0);
    const lines = [
      `${followUps.length} offene Offerte(n) zum Nachfassen, zusammen CHF ${total.toFixed(2)} — die wertvollste zuerst:`,
      '',
    ];
    followUps.forEach((f, index) => {
      const expiry = f.expiresInDays !== null && f.expiresInDays <= 7
        ? f.expiresInDays < 0 ? ' · abgelaufen' : ` · läuft in ${f.expiresInDays} Tagen ab`
        : '';
      lines.push(
        `${index + 1}. ${f.quotationNumber} — ${f.customerName}: CHF ${Number(f.value).toFixed(2)}`
        + ` · seit ${f.daysOpen} Tagen offen${expiry}`,
      );
      if (f.title) lines.push(`   ${f.title}`);
    });
    lines.push('');
    lines.push('Gesprächseinstieg: nach dem Stand fragen (offen, nachfassen, verloren, gewonnen)'
      + ' und den Grund festhalten. Keine Preiszugeständnisse ohne Rücksprache.');
    return lines.join('\n');
  }
}

export default new SalesService();
