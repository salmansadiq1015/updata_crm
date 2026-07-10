import { t } from '../i18n.js';
import { pdfColors } from './colors.js';
import { pdfFonts } from './fonts.js';

const ROW_HEIGHT = 16;
const HEADER_HEIGHT = 18;
// Product/line image (rendered above the description text when present)
const IMG_MAX_HEIGHT = 120;
const IMG_GAP = 4;

export default class TableRenderer {
  draw(doc, pm, ciConfig, data, language, config = {}) {
    const items = data.lineItems || [];
    if (!items.length) return;
    const left = pm.margins.left;
    const colors = pdfColors(ciConfig);
    const fonts = pdfFonts(ciConfig);
    const cols = this._buildCols(config.tableColumns || data.tableColumns, pm.contentWidth, language);
    this._drawTableHeader(doc, pm, cols, left, language, colors, fonts);
    for (const item of items) {
      const rowHeight = this._measureRowHeight(doc, pm, item, cols, language, fonts);
      const newPage = pm.checkSpace(rowHeight);
      if (newPage) {
        this._drawTableHeader(doc, pm, cols, left, language, colors, fonts);
      }
      this._drawRow(doc, pm, item, cols, left, language, rowHeight, colors, fonts);
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
      { field:'description',pct:0.37, align:'left',  label:t(language,'description') },
      { field:'unit',      pct:0.08, align:'left',  label:t(language,'unit') },
      { field:'quantity',  pct:0.08, align:'right', label:t(language,'quantity') },
      { field:'unitPrice', pct:0.15, align:'right', label:t(language,'unitPrice') },
      { field:'discount',  pct:0.09, align:'right', label:t(language,'discount') },
      { field:'total',     pct:0.18, align:'right', label:t(language,'total') },
    ];
    let x = 0;
    return defs.map((d) => { const col = { ...d, width: width * d.pct, x }; x += col.width; return col; });
  }

  _drawTableHeader(doc, pm, cols, left, _language, colors, fonts) {
    pm.checkSpace(HEADER_HEIGHT + 4);
    const y = pm.currentY;
    doc.save();
    doc.rect(left, y - 3, pm.contentWidth, HEADER_HEIGHT).fill(colors.tableHeader);
    doc.font(fonts.medium).fontSize(8).fillColor(colors.primary);
    for (const col of cols) {
      doc.text(col.label, left + col.x, y, { width: col.width - 4, align: col.align });
    }
    doc.restore();
    pm.moveDown(HEADER_HEIGHT);
    doc.moveTo(left, pm.currentY).lineTo(left + pm.contentWidth, pm.currentY).lineWidth(0.5).strokeColor(colors.border).stroke();
    pm.moveDown(3);
  }

  _drawRow(doc, pm, item, cols, left, language, rowHeight = ROW_HEIGHT, colors = pdfColors(), fonts = pdfFonts()) {
    // Text-only row (section header inside table)
    if (item.type === 'text') {
      pm.checkSpace(rowHeight);
      doc.save().font(fonts.italic).fontSize(9).fillColor(colors.muted);
      doc.text(item.description || '', left, pm.currentY, { width: pm.contentWidth });
      pm.moveDown(rowHeight);
      doc.restore();
      return;
    }

    const isOptional = item.isOptional || item.type === 'optional';
    pm.checkSpace(rowHeight);
    const y = pm.currentY;

    // Attached product image: rendered at the top of the description column; the
    // textual row is pushed down below it. Failures never break the row.
    let imageExtra = 0;
    if (item.imageBuffer) {
      const box = this._descColBox(cols, pm);
      const dims = this._imageBox(doc, item.imageBuffer, box.width, IMG_MAX_HEIGHT);
      try {
        doc.image(item.imageBuffer, left + box.x, y, { fit: [dims.w, dims.h] });
      } catch {
        // Ignore a malformed image buffer — render the row without the picture.
      }
      imageExtra = dims.h + IMG_GAP;
    }

    doc.save().font(isOptional ? fonts.italic : fonts.body).fontSize(9).fillColor(colors.text);

    const vals = {
      position:    item.position != null ? String(item.position) : '',
      description: (isOptional ? `${t(language, 'optional')} ` : '') + (item.description || ''),
      unit:        item.unit != null ? String(item.unit) : '',
      quantity:    item.quantity != null ? String(item.quantity) : '',
      unitPrice:   item.unitPrice != null ? item.unitPrice.toFixed(2) : '',
      discount:    item.discountPercent ? `${item.discountPercent}%` : '',
      total:       (item.total ?? item.lineTotal) != null ? (item.total ?? item.lineTotal).toFixed(2) : '',
    };

    const textY = y + imageExtra;
    for (const col of cols) {
      const v = vals[col.field] ?? '';
      doc.text(v, left + col.x, textY, { width: col.width - 4, align: col.align });
    }
    doc.restore();
    pm.moveDown(rowHeight);
  }

  _measureRowHeight(doc, pm, item, cols, language, fonts = pdfFonts()) {
    if (item.type === 'text') {
      doc.save().font(fonts.italic).fontSize(9);
      const height = doc.heightOfString(item.description || '', { width: pm.contentWidth });
      doc.restore();
      return Math.max(ROW_HEIGHT, Math.ceil(height) + 6);
    }

    const isOptional = item.isOptional || item.type === 'optional';
    const vals = {
      position:    item.position != null ? String(item.position) : '',
      description: (isOptional ? `${t(language, 'optional')} ` : '') + (item.description || ''),
      unit:        item.unit != null ? String(item.unit) : '',
      quantity:    item.quantity != null ? String(item.quantity) : '',
      unitPrice:   item.unitPrice != null ? item.unitPrice.toFixed(2) : '',
      discount:    item.discountPercent ? `${item.discountPercent}%` : '',
      total:       (item.total ?? item.lineTotal) != null ? (item.total ?? item.lineTotal).toFixed(2) : '',
    };

    doc.save().font(isOptional ? fonts.italic : fonts.body).fontSize(9);
    const height = cols.reduce((max, col) => {
      const value = vals[col.field] ?? '';
      return Math.max(max, doc.heightOfString(value, { width: col.width - 4, align: col.align }));
    }, ROW_HEIGHT);
    doc.restore();

    let imageExtra = 0;
    if (item.imageBuffer) {
      const box = this._descColBox(cols, pm);
      const dims = this._imageBox(doc, item.imageBuffer, box.width, IMG_MAX_HEIGHT);
      imageExtra = dims.h + IMG_GAP;
    }

    return Math.max(ROW_HEIGHT, Math.ceil(height) + 6) + imageExtra;
  }

  /** Position + inner width of the description column (where line images sit). */
  _descColBox(cols, pm) {
    const descCol = cols.find((c) => c.field === 'description');
    const x = descCol ? descCol.x : 0;
    const width = (descCol ? descCol.width : pm.contentWidth) - 4;
    return { x, width: Math.max(20, width) };
  }

  /**
   * Scaled draw dimensions for a line image within a box, preserving aspect
   * ratio and never upscaling. Falls back to the full box when the natural
   * size can't be read (e.g. test doubles without openImage()).
   */
  _imageBox(doc, buffer, boxW, boxH) {
    try {
      if (buffer && typeof doc.openImage === 'function') {
        const img = doc.openImage(buffer);
        if (img && img.width > 0 && img.height > 0) {
          const scale = Math.min(boxW / img.width, boxH / img.height, 1);
          return { w: Math.max(1, img.width * scale), h: Math.max(1, img.height * scale) };
        }
      }
    } catch {
      // fall through to the fixed box
    }
    return { w: boxW, h: boxH };
  }
}
