import { t } from '../i18n.js';
import { pdfColors } from './colors.js';
import { pdfFonts } from './fonts.js';
import RichTextRenderer from './RichTextRenderer.js';

// Renders the structured body of service reports and inspection certificates
// (DOC-004). Every block is conditional on the corresponding data being present,
// so the same generic renderer serves both document types and degrades to nothing
// when no structured data is supplied.
export default class ReportRenderer {
  constructor() {
    this.richText = new RichTextRenderer();
  }

  draw(doc, pm, ciConfig, data, language, _config = {}) {
    const colors = pdfColors(ciConfig);
    const fonts = pdfFonts(ciConfig);

    this._equipmentBlock(doc, pm, data.equipment, language, colors, fonts);
    this._textBlock(doc, pm, t(language, 'findings'), data.findings, language, colors, fonts);
    this._textBlock(doc, pm, t(language, 'workPerformed'), data.workPerformed, language, colors, fonts);
    this._materialsBlock(doc, pm, data.materialsUsed, language, colors, fonts);
    this._textBlock(doc, pm, t(language, 'recommendations'), data.recommendations, language, colors, fonts);
    this._lineBlock(doc, pm, t(language, 'timeSpent'), data.timeSpent, colors, fonts);
    this._checklistBlock(doc, pm, data.checklist, language, colors, fonts);
    this._resultBlock(doc, pm, data.overallResult ?? data.result, language, colors, fonts);
    this._lineBlock(doc, pm, t(language, 'nextInspection'), data.nextInspectionDate, colors, fonts);
    this._signatureBlock(doc, pm, data, language, colors, fonts);
  }

  _heading(doc, pm, label, colors, fonts) {
    pm.checkSpace(24);
    doc.save().font(fonts.bold).fontSize(10).fillColor(colors.primary);
    doc.text(label, pm.margins.left, pm.currentY, { width: pm.contentWidth });
    doc.restore();
    pm.moveDown(14);
  }

  _equipmentBlock(doc, pm, equipment, language, colors, fonts) {
    if (!equipment || typeof equipment !== 'object') return;
    this._heading(doc, pm, t(language, 'equipment'), colors, fonts);
    const rows = [
      [t(language, 'description'), equipment.name],
      [t(language, 'model'), equipment.model],
      [t(language, 'serialNumber'), equipment.serialNumber],
      [t(language, 'location'), equipment.location],
    ].filter(([, value]) => `${value ?? ''}`.trim());
    doc.save().font(fonts.body).fontSize(9).fillColor(colors.text);
    for (const [label, value] of rows) {
      pm.checkSpace(13);
      doc.text(`${label}: ${value}`, pm.margins.left, pm.currentY, { width: pm.contentWidth });
      pm.moveDown(13);
    }
    doc.restore();
    pm.moveDown(6);
  }

  _textBlock(doc, pm, label, value, _language, colors, fonts) {
    if (!`${value ?? ''}`.trim()) return;
    this._heading(doc, pm, label, colors, fonts);
    this.richText.draw(doc, pm, String(value), { colors, fonts, fontSize: 9, lineGap: 4 });
    pm.moveDown(6);
  }

  _lineBlock(doc, pm, label, value, colors, fonts) {
    if (!`${value ?? ''}`.trim()) return;
    pm.checkSpace(14);
    doc.save().font(fonts.body).fontSize(9).fillColor(colors.text);
    doc.text(`${label}: ${value}`, pm.margins.left, pm.currentY, { width: pm.contentWidth });
    doc.restore();
    pm.moveDown(14);
  }

  _materialsBlock(doc, pm, materials, language, colors, fonts) {
    if (!Array.isArray(materials) || !materials.length) return;
    this._heading(doc, pm, t(language, 'materialsUsed'), colors, fonts);
    doc.save().font(fonts.body).fontSize(9).fillColor(colors.text);
    for (const item of materials) {
      const qty = [item.quantity, item.unit].filter((v) => `${v ?? ''}`.trim()).join(' ');
      const line = [qty, item.description].filter(Boolean).join(' - ');
      pm.checkSpace(13);
      doc.text(`- ${line}`, pm.margins.left, pm.currentY, { width: pm.contentWidth });
      pm.moveDown(13);
    }
    doc.restore();
    pm.moveDown(6);
  }

  _statusLabel(status, language) {
    const key = { pass: 'pass', fail: 'fail', na: 'na' }[`${status}`.toLowerCase()] || 'na';
    return t(language, key);
  }

  _checklistBlock(doc, pm, checklist, language, colors, fonts) {
    if (!Array.isArray(checklist) || !checklist.length) return;
    this._heading(doc, pm, t(language, 'checklist'), colors, fonts);
    const valueX = pm.margins.left + pm.contentWidth * 0.75;
    const valueW = pm.contentWidth * 0.25;
    for (const item of checklist) {
      const status = `${item.status}`.toLowerCase();
      const ok = status === 'pass';
      pm.checkSpace(14);
      doc.save().font(fonts.body).fontSize(9).fillColor(colors.text);
      doc.text(item.label || '', pm.margins.left, pm.currentY, { width: pm.contentWidth * 0.7 });
      doc.font(fonts.bold).fillColor(ok ? colors.primary : (colors.danger || colors.secondary || colors.text));
      doc.text(this._statusLabel(item.status, language), valueX, pm.currentY, { width: valueW, align: 'right' });
      doc.restore();
      pm.moveDown(14);
    }
    pm.moveDown(4);
  }

  _resultBlock(doc, pm, result, language, colors, fonts) {
    if (!`${result ?? ''}`.trim()) return;
    const ok = `${result}`.toLowerCase() === 'pass';
    pm.checkSpace(18);
    doc.save().font(fonts.bold).fontSize(11).fillColor(ok ? colors.primary : (colors.danger || colors.secondary || colors.text));
    doc.text(`${t(language, 'overallResult')}: ${this._statusLabel(result, language)}`, pm.margins.left, pm.currentY, { width: pm.contentWidth });
    doc.restore();
    pm.moveDown(18);
  }

  _signatureBlock(doc, pm, data, language, colors, fonts) {
    const signer = data.technician || data.inspector;
    const signerName = typeof signer === 'string' ? signer : signer?.name;
    const roleLabel = data.technician ? t(language, 'technician') : (data.inspector ? t(language, 'inspector') : null);
    if (!signerName && !roleLabel) return;

    pm.checkSpace(40);
    pm.moveDown(16);
    const left = pm.margins.left;
    const lineWidth = pm.contentWidth * 0.4;
    doc.save();
    doc.moveTo(left, pm.currentY).lineTo(left + lineWidth, pm.currentY).lineWidth(0.5).strokeColor(colors.border).stroke();
    pm.moveDown(4);
    doc.font(fonts.body).fontSize(8).fillColor(colors.muted);
    const parts = [t(language, 'signature')];
    if (roleLabel) parts.push(roleLabel);
    if (signerName) parts.push(signerName);
    doc.text(parts.join(' - '), left, pm.currentY, { width: lineWidth });
    doc.restore();
    pm.moveDown(12);
  }
}
