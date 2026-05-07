import { t } from '../i18n.js';

const LINE = 16;

export default class TotalsRenderer {
  draw(doc, pm, ciConfig, data, language, config = {}) {
    const left = pm.margins.left;
    const width = pm.contentWidth;
    const labelX = left + width * 0.60;
    const labelW = width * 0.25;
    const valueX = left + width * 0.85;
    const valueW = width * 0.15;
    const currency = data.currency || t(language, 'currency');

    pm.checkSpace(LINE * 4);
    doc.moveTo(labelX, pm.currentY).lineTo(left + width, pm.currentY).lineWidth(0.5).strokeColor('#CCCCCC').stroke();
    pm.moveDown(6);

    const row = (label, value, bold = false) => {
      pm.checkSpace(LINE);
      doc.save();
      doc.fontSize(bold ? 11 : 9).fillColor(bold ? '#1B3F8B' : '#1A1A1A');
      if (bold) doc.font('Helvetica-Bold');
      doc.text(label, labelX, pm.currentY, { width: labelW });
      doc.text(value, valueX, pm.currentY, { width: valueW, align: 'right' });
      doc.restore();
      pm.moveDown(LINE);
    };

    if (data.subtotal != null) {
      row(t(language, 'subtotal'), `${currency} ${data.subtotal.toFixed(2)}`);
    }
    for (const vat of (data.vatBreakdown || [])) {
      row(`${t(language, 'vat')} ${(vat.rate * 100).toFixed(1)}%`, `${currency} ${vat.amount.toFixed(2)}`);
    }

    // Advance deductions (final invoices)
    if (data.advanceDeductions?.length) {
      pm.checkSpace(LINE * (data.advanceDeductions.length + 2));
      doc.save().fontSize(9).fillColor('#1A1A1A').font('Helvetica-Bold');
      doc.text(t(language, 'advanceDeduction'), labelX, pm.currentY, { width: labelW + valueW });
      pm.moveDown(LINE);
      doc.restore();
      for (const d of data.advanceDeductions) {
        row(`${d.invoiceNumber} (${d.date})`, `-${currency} ${d.amount.toFixed(2)}`);
      }
      if (data.netBalance != null) {
        row(t(language, 'netBalance'), `${currency} ${data.netBalance.toFixed(2)}`);
      }
    }

    row(t(language, 'grandTotal'), `${currency} ${(data.grandTotalRounded ?? data.grandTotal ?? 0).toFixed(2)}`, true);
  }
}
