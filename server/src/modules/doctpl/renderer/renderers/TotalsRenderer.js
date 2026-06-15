import { t } from '../i18n.js';
import { pdfColors } from './colors.js';
import { pdfFonts } from './fonts.js';

const LINE = 16;

function formatVatRate(rate) {
  const numericRate = Number(rate || 0);
  const percent = numericRate > 1 ? numericRate : numericRate * 100;
  return percent.toFixed(1);
}

export default class TotalsRenderer {
  draw(doc, pm, ciConfig, data, language, _config = {}) {
    const left = pm.margins.left;
    const width = pm.contentWidth;
    const labelX = left + width * 0.60;
    const labelW = width * 0.25;
    const valueX = left + width * 0.85;
    const valueW = width * 0.15;
    const currency = data.currency || t(language, 'currency');
    const colors = pdfColors(ciConfig);
    const fonts = pdfFonts(ciConfig);

    pm.checkSpace(LINE * 4);
    doc.moveTo(labelX, pm.currentY).lineTo(left + width, pm.currentY).lineWidth(0.5).strokeColor(colors.border).stroke();
    pm.moveDown(6);

    const row = (label, value, bold = false) => {
      pm.checkSpace(LINE);
      doc.save();
      doc.font(bold ? fonts.bold : fonts.body).fontSize(bold ? 11 : 9).fillColor(bold ? colors.primary : colors.text);
      doc.text(label, labelX, pm.currentY, { width: labelW });
      doc.text(value, valueX, pm.currentY, { width: valueW, align: 'right' });
      doc.restore();
      pm.moveDown(LINE);
    };

    if (data.subtotal != null) {
      row(t(language, 'subtotal'), `${currency} ${data.subtotal.toFixed(2)}`);
    }
    for (const vat of (data.vatBreakdown || [])) {
      row(`${t(language, 'vat')} ${formatVatRate(vat.rate)}%`, `${currency} ${vat.amount.toFixed(2)}`);
    }

    // Advance deductions (final invoices)
    if (data.advanceDeductions?.length) {
      pm.checkSpace(LINE * (data.advanceDeductions.length + 2));
      doc.save().font(fonts.bold).fontSize(9).fillColor(colors.text);
      doc.text(t(language, 'advanceDeduction'), labelX, pm.currentY, { width: labelW + valueW });
      pm.moveDown(LINE);
      doc.restore();
      for (const d of data.advanceDeductions) {
        row(this._deductionLabel(d), this._deductionTotal(d, currency));
        const detail = this._deductionDetail(d, currency, language);
        if (detail) {
          pm.checkSpace(12);
          doc.save().font(fonts.body).fontSize(7).fillColor(colors.muted);
          doc.text(detail, labelX, pm.currentY - 2, { width: labelW + valueW, align: 'right' });
          doc.restore();
          pm.moveDown(10);
        }
      }
      if (data.netBalance != null) {
        row(t(language, 'netBalance'), `${currency} ${data.netBalance.toFixed(2)}`);
      }
    }

    row(t(language, 'grandTotal'), `${currency} ${(data.grandTotalRounded ?? data.grandTotal ?? 0).toFixed(2)}`, true);
  }

  _deductionLabel(deduction) {
    return [deduction.invoiceNumber, deduction.date ? `(${deduction.date})` : '']
      .filter(Boolean)
      .join(' ');
  }

  _deductionTotal(deduction, currency) {
    const total = deduction.totalAmount ?? deduction.amount ?? 0;
    return `-${currency} ${Number(total).toFixed(2)}`;
  }

  _deductionDetail(deduction, currency, language) {
    const parts = [];
    if (deduction.netAmount != null) {
      parts.push(`${t(language, 'net')} ${currency} ${Number(deduction.netAmount).toFixed(2)}`);
    }
    if (deduction.vatAmount != null) {
      parts.push(`${t(language, 'vatAmount')} ${currency} ${Number(deduction.vatAmount).toFixed(2)}`);
    }
    if (deduction.totalAmount != null) {
      parts.push(`${t(language, 'grossTotal')} ${currency} ${Number(deduction.totalAmount).toFixed(2)}`);
    }
    return parts.join(' | ');
  }
}
