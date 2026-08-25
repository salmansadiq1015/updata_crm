/**
 * Finanz AI — incoming supplier invoices, checked before anybody pays.
 *
 * The specification: "Kreditoren: erkennt Lieferantenrechnungen, prüft IBAN
 * und QR-Referenz, bereitet Zahlungen zur Freigabe vor." Its allowedActions
 * list is empty on purpose — it prepares and it blocks, and a person pays.
 *
 * The checks that matter are arithmetic, not opinion. An IBAN and a QR
 * reference each carry a checksum, and the AP validator accepts an IBAN on
 * its shape alone today — so a mistyped digit reaches the bank. Those are
 * verified here, against records actually read: money is not a place for a
 * hallucinated all-clear.
 */
import mongoose from 'mongoose';
import { BLOCK_REASONS, blocked } from '../../governance/agent.risk.js';
import {
  checkReference, formatIban, isQrIban, isSwissIban, isValidIban,
} from './swissPayment.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

function swissDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function money(amount, currency = 'CHF') {
  if (amount === null || amount === undefined) return null;
  return `${currency} ${Number(amount).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

class FinanzService {
  /**
   * Everything that must hold before a supplier invoice is paid. Blockers stop
   * the payment; warnings are worth naming without stopping it.
   */
  async checkBeforePayment(invoiceRef) {
    const blockers = [];
    const warnings = [];
    const invoiceId = invoiceRef?._id || invoiceRef?.id;

    if (!invoiceId || !dbReady()) {
      return { verified: false, invoice: invoiceRef, blockers, warnings, ok: false };
    }

    let invoice;
    try {
      const ApInvoice = (await import('../../../accounting/apInvoice.model.js')).default;
      invoice = await ApInvoice.findById(invoiceId)
        .select('supplierInvoiceNumber supplierId supplierName supplierIban supplierBic amount totalAmount outstandingAmount paidAmount currency status dueDate invoiceDate projectId projectReference orderReference paymentReference documentId approvedBy')
        .lean();
    } catch (err) {
      logger.warn('Finanz AI could not read the invoice', {
        module: 'ai-finanz', action: 'checkBeforePayment', error: err.message,
      });
      return { verified: false, invoice: invoiceRef, blockers, warnings, ok: false };
    }
    if (!invoice) return { verified: false, invoice: invoiceRef, blockers, warnings, ok: false };

    // 1. Who is being paid.
    if (!invoice.supplierName && !invoice.supplierId) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
        detail: 'Kein Lieferant auf der Rechnung — es ist nicht bestimmbar, wer bezahlt würde.',
      });
    }

    // 2. How much.
    const amount = invoice.outstandingAmount ?? invoice.totalAmount ?? invoice.amount ?? null;
    if (!amount || amount <= 0) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
        detail: 'Kein offener Betrag — es gibt nichts zu zahlen.',
      });
    }

    // 3 to 6. The bank coordinates. Everything here is arithmetic, and every
    // failure is a payment that goes nowhere or to the wrong account.
    const iban = String(invoice.supplierIban || '').replace(/\s/g, '');
    if (!iban) {
      blockers.push({
        reason: BLOCK_REASONS.PAYMENT_OR_BANK_DATA,
        detail: 'Keine IBAN hinterlegt — ohne Kontoverbindung keine Zahlung.',
      });
    } else if (!isValidIban(iban)) {
      blockers.push({
        reason: BLOCK_REASONS.PAYMENT_OR_BANK_DATA,
        detail: `Die IBAN ${formatIban(iban)} ist ungültig — die Prüfziffer stimmt nicht. Wahrscheinlich ein Tippfehler.`,
      });
    } else if (!isSwissIban(iban)) {
      warnings.push(`${formatIban(iban)} ist keine Schweizer IBAN — Auslandzahlung, Gebühren und Frist prüfen.`);
    }

    const found = await this._paymentReference(invoice);
    const reference = found.value ? checkReference(found.value) : { kind: null, valid: false };
    const qrIban = iban && isQrIban(iban);

    if (qrIban && reference.kind !== 'QR') {
      blockers.push({
        reason: BLOCK_REASONS.PAYMENT_OR_BANK_DATA,
        detail: 'QR-IBAN ohne QR-Referenz — eine solche Zahlung wird von der Bank zurückgewiesen.',
      });
    }
    if (!qrIban && iban && reference.kind === 'QR') {
      blockers.push({
        reason: BLOCK_REASONS.PAYMENT_OR_BANK_DATA,
        detail: 'QR-Referenz auf einer normalen IBAN — die Referenz gehört zu einer QR-IBAN.',
      });
    }
    if (reference.kind && !reference.valid) {
      blockers.push({
        reason: BLOCK_REASONS.PAYMENT_OR_BANK_DATA,
        detail: reference.kind === 'QR'
          ? `Die QR-Referenz stimmt nicht (${reference.length} statt 27 Stellen oder falsche Prüfziffer).`
          : 'Die Creditor Reference (RF) stimmt nicht — die Prüfziffer geht nicht auf.',
      });
    }
    if (!reference.kind) {
      warnings.push(found.reason);
    }

    // 7. When.
    if (!invoice.dueDate) {
      warnings.push('Kein Fälligkeitsdatum — Skonto und Mahnfrist sind nicht beurteilbar.');
    } else {
      const days = Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86_400_000);
      if (days > 0) warnings.push(`Seit ${days} Tag(en) überfällig (fällig am ${swissDate(invoice.dueDate)}).`);
    }

    // 8. Not twice, and not already settled.
    if (['PAID', 'CANCELLED'].includes(invoice.status)) {
      blockers.push({
        reason: BLOCK_REASONS.CONTRADICTORY_DATA,
        detail: `Die Rechnung steht auf ${invoice.status} — sie ist nicht mehr zu zahlen.`,
      });
    }
    const duplicate = await this._duplicate(invoice);
    if (duplicate) {
      blockers.push({
        reason: BLOCK_REASONS.CONTRADICTORY_DATA,
        detail: `Rechnung ${duplicate.supplierInvoiceNumber} über denselben Betrag ist bereits unter „${duplicate.supplierName || 'anderer Lieferant'}" erfasst (${duplicate.status}) — Doppelzahlung möglich.`,
      });
    }

    // 9. Approved by a person. The agent never supplies this.
    if (!invoice.approvedBy && invoice.status === 'RECORDED') {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_APPROVAL,
        detail: 'Die Rechnung ist noch nicht freigegeben.',
      });
    }

    // 10. Where it lands in the books.
    if (!invoice.projectId && !invoice.projectReference) {
      warnings.push('Kein Projektbezug — die Kosten lassen sich keinem Auftrag zuordnen.');
    }

    // Said on every check: the coordinates are well-formed, not confirmed.
    if (iban && isValidIban(iban)) {
      warnings.push('Die IBAN ist formal korrekt — ob das Konto dem Lieferanten gehört, prüft dieses System nicht.');
    }

    logger.info('Finanz AI checked an invoice before payment', {
      module: 'ai-finanz',
      action: 'checkBeforePayment',
      invoiceId: String(invoice._id),
      blockers: blockers.length,
    });

    return {
      verified: true,
      ok: blockers.length === 0,
      invoice,
      amount,
      iban,
      reference,
      qrIban,
      blockers,
      warnings,
    };
  }

  /**
   * The payment reference, read out of the scanned invoice.
   *
   * The AP invoice record has no field for one — it keeps an IBAN, a project
   * reference and an order reference, none of which is the QR/ESR reference a
   * Swiss payment must quote. So it is looked for in the OCR text of the
   * linked document, and where it came from is reported: a reference nobody
   * captured is a different situation from one that failed its checksum.
   */
  async _paymentReference(invoice) {
    if (!invoice.documentId) {
      return { value: null, reason: 'Keine Zahlungsreferenz erfasst — es ist kein gescanntes Dokument verknüpft.' };
    }
    try {
      const AccountingDocument = (await import('../../../accounting/accountingDocument.model.js')).default;
      const document = await AccountingDocument.findById(invoice.documentId)
        .select('fullText ocrStatus fileName').lean();
      if (!document) {
        return { value: null, reason: 'Keine Zahlungsreferenz erfasst — das verknüpfte Dokument fehlt.' };
      }
      if (!document.fullText) {
        return {
          value: null,
          reason: document.ocrStatus === 'COMPLETED'
            ? 'Keine Zahlungsreferenz gefunden — im gescannten Text steht keine.'
            : `Zahlungsreferenz nicht prüfbar — die Texterkennung steht auf ${document.ocrStatus || 'PENDING'}.`,
        };
      }

      const text = document.fullText;
      const qr = text.match(/\b(\d[\d\s]{25,32}\d)\b/g)
        ?.map((candidate) => candidate.replace(/\s/g, ''))
        .find((candidate) => candidate.length === 27);
      if (qr) return { value: qr, source: document.fileName };

      const rf = text.match(/\bRF\d{2}[A-Z0-9]{1,21}\b/i)?.[0];
      if (rf) return { value: rf, source: document.fileName };

      return { value: null, reason: 'Keine Zahlungsreferenz gefunden — im gescannten Text steht keine.' };
    } catch (err) {
      logger.warn('Finanz AI could not read the payment reference', {
        module: 'ai-finanz', action: 'paymentReference', error: err.message,
      });
      return { value: null, reason: 'Die Zahlungsreferenz konnte nicht geprüft werden.' };
    }
  }

  /**
   * The same invoice recorded twice under two different supplier entries.
   *
   * A unique index already covers (supplierId, supplierInvoiceNumber), so the
   * obvious duplicate cannot be created at all — checking for it again would
   * be dead code. What the index does not catch is the same paper booked
   * against two supplier records, which happens when a supplier is entered
   * twice, and which pays the same bill twice.
   */
  async _duplicate(invoice) {
    if (!invoice.supplierInvoiceNumber) return null;
    try {
      const ApInvoice = (await import('../../../accounting/apInvoice.model.js')).default;
      const twin = await ApInvoice.findOne({
        _id: { $ne: invoice._id },
        supplierInvoiceNumber: invoice.supplierInvoiceNumber,
        status: { $nin: ['CANCELLED'] },
      }).select('supplierInvoiceNumber supplierName status totalAmount').lean();
      if (!twin) return null;
      // Same number under another supplier is only suspicious when the amount
      // matches too — invoice numbering restarts at 1 in plenty of firms.
      const sameAmount = Math.abs((twin.totalAmount || 0) - (invoice.totalAmount || 0)) < 0.01;
      return sameAmount ? twin : null;
    } catch (err) {
      logger.warn('Finanz AI could not check for a duplicate', {
        module: 'ai-finanz', action: 'duplicate', error: err.message,
      });
      return null;
    }
  }

  /**
   * The supplier invoices a question could be about. Narrowed by invoice
   * number or supplier name when one was given; otherwise the ones still
   * waiting to be paid, soonest due first.
   */
  async findInvoices({ number = null, supplier = null, limit = 10 } = {}) {
    if (!dbReady()) return [];
    try {
      const ApInvoice = (await import('../../../accounting/apInvoice.model.js')).default;
      const filter = { status: { $nin: ['PAID', 'CANCELLED'] } };
      if (number) {
        const pattern = new RegExp(String(number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ supplierInvoiceNumber: pattern }, { apInvoiceNumber: pattern }];
      } else if (supplier) {
        filter.supplierName = new RegExp(String(supplier).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
      return await ApInvoice.find(filter)
        .select('apInvoiceNumber supplierInvoiceNumber supplierName totalAmount outstandingAmount currency dueDate status')
        .sort({ dueDate: 1 })
        .limit(limit)
        .lean();
    } catch (err) {
      logger.warn('Finanz AI could not list the invoices', {
        module: 'ai-finanz', action: 'findInvoices', error: err.message,
      });
      return [];
    }
  }

  /** Several invoices match: name them so the office can pick. */
  composeList(invoices) {
    const lines = [`**${invoices.length} offene Kreditorenrechnungen passen dazu:**`, ''];
    for (const invoice of invoices) {
      const amount = money(invoice.outstandingAmount ?? invoice.totalAmount, invoice.currency);
      lines.push(`- **${invoice.supplierName || 'Unbekannter Lieferant'}** — ${invoice.supplierInvoiceNumber || invoice.apInvoiceNumber}, ${amount}${invoice.dueDate ? `, fällig am ${swissDate(invoice.dueDate)}` : ''}.`);
    }
    lines.push('');
    lines.push('Welche soll ich vor der Zahlung prüfen?');
    return lines.join('\n');
  }

  /** The check, as the office reads it. */
  compose(result) {
    if (!result.verified) {
      return 'Die Rechnung konnte nicht gelesen werden — die Zahlungsprüfung ist nicht aussagekräftig.';
    }

    const invoice = result.invoice;
    const who = invoice.supplierName || 'Unbekannter Lieferant';
    const lines = [result.ok
      ? `**${who} — ${money(result.amount, invoice.currency)} kann zur Zahlung freigegeben werden.**`
      : `**${who} — ${money(result.amount, invoice.currency)} ist nicht zahlungsbereit.**`, ''];

    const facts = [];
    if (invoice.supplierInvoiceNumber) facts.push(`Rechnung ${invoice.supplierInvoiceNumber}`);
    if (invoice.dueDate) facts.push(`fällig am ${swissDate(invoice.dueDate)}`);
    if (result.iban) facts.push(`${result.qrIban ? 'QR-IBAN' : 'IBAN'} ${formatIban(result.iban)}`);
    if (result.reference?.kind) facts.push(`Referenz ${result.reference.kind} (aus dem Scan gelesen)`);
    if (facts.length) lines.push(`${facts.join(' · ')}.`);

    if (result.blockers.length) {
      lines.push('');
      lines.push('**Das hält die Zahlung auf**');
      for (const blocker of result.blockers) lines.push(`- ${blocker.detail}`);
    }
    if (result.warnings.length) {
      lines.push('');
      lines.push('**Zu beachten**');
      for (const warning of result.warnings) lines.push(`- ${warning}`);
    }

    lines.push('');
    lines.push('Bezahlt wird nichts automatisch — ein Zahlungsentwurf geht erst nach Freigabe an die Bank.');
    return lines.join('\n');
  }

  /** The blocked outcome, in the shape every agent uses. */
  toBlocked(action, result) {
    const first = result.blockers[0];
    return {
      ...blocked(action, first.reason, { message: this.compose(result) }),
      blockers: result.blockers.map((blocker) => blocker.detail),
      warnings: result.warnings,
    };
  }
}

export default new FinanzService();
