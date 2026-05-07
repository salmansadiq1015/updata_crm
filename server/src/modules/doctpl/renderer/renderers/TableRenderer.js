import { t } from '../i18n.js';

const ROW_HEIGHT = 16;
const HEADER_HEIGHT = 18;

export default class TableRenderer {
  draw(doc, pm, ciConfig, data, language, config = {}) {
    const items = data.lineItems || [];
    if (!items.length) return;
    const left = pm.margins.left;
    const cols = this._buildCols(config.tableColumns || data.tableColumns, pm.contentWidth, language);
    this._drawTableHeader(doc, pm, cols, left, language);
    for (const item of items) {
      this._drawRow(doc, pm, item, cols, left, language);
    }
    pm.moveDown(4);
  }

  _buildCols(tableColumns, width, language) {
    if (tableColumns?.length) {
      let x = 0;
      return tableColumns.map((c) => {
        const col = { field: c.field, label: c.label?.[language] || c.label?.de || c.field, width: width * (c.widthPercent / 100), align: c.alignment || 'left', format: c.format || 'text', x };
        x += col.width;
        return col;
      });
    }
    const defs = [
      { field:'position',  pct:0.05, align:'left',  label:t(language,'position') },
      { field:'description',pct:0.40, align:'left',  label:t(language,'description') },
      { field:'quantity',  pct:0.10, align:'right', label:t(language,'quantity') },
      { field:'unitPrice', pct:0.15, align:'right', label:t(language,'unitPrice') },
      { field:'discount',  pct:0.10, align:'right', label:t(language,'discount') },
      { field:'total',     pct:0.20, align:'right', label:t(language,'total') },
    ];
    let x = 0;
    return defs.map((d) => { const col = { ...d, width: width * d.pct, x }; x += col.width; return col; });
  }

  _drawTableHeader(doc, pm, cols, left, language) {
    pm.checkSpace(HEADER_HEIGHT + 4);
    const y = pm.currentY;
    doc.save().fontSize(8).fillColor('#1B3F8B').font('Helvetica-Bold');
    for (const col of cols) {
      doc.text(col.label, left + col.x, y, { width: col.width - 4, align: col.align });
    }
    doc.restore();
    pm.moveDown(HEADER_HEIGHT);
    doc.moveTo(left, pm.currentY).lineTo(left + pm.contentWidth, pm.currentY).lineWidth(0.5).strokeColor('#CCCCCC').stroke();
    pm.moveDown(3);
  }

  _drawRow(doc, pm, item, cols, left, language) {
    // Text-only row (section header inside table)
    if (item.type === 'text') {
      pm.checkSpace(ROW_HEIGHT);
      doc.save().fontSize(9).fillColor('#444444').font('Helvetica-Oblique');
      doc.text(item.description || '', left, pm.currentY, { width: pm.contentWidth });
      pm.moveDown(ROW_HEIGHT);
      doc.restore();
      return;
    }

    const isOptional = item.isOptional || item.type === 'optional';
    pm.checkSpace(ROW_HEIGHT);
    const y = pm.currentY;

    doc.save().fontSize(9).fillColor('#1A1A1A');
    if (isOptional) doc.font('Helvetica-Oblique');

    const vals = {
      position:    item.position != null ? String(item.position) : '',
      description: (isOptional ? `${t(language, 'optional')} ` : '') + (item.description || ''),
      quantity:    item.quantity != null ? String(item.quantity) : '',
      unitPrice:   item.unitPrice != null ? item.unitPrice.toFixed(2) : '',
      discount:    item.discountPercent ? `${item.discountPercent}%` : '',
      total:       (item.total ?? item.lineTotal) != null ? (item.total ?? item.lineTotal).toFixed(2) : '',
    };

    for (const col of cols) {
      const v = vals[col.field] ?? '';
      doc.text(v, left + col.x, y, { width: col.width - 4, align: col.align });
    }
    doc.restore();
    pm.moveDown(ROW_HEIGHT);
  }
}
