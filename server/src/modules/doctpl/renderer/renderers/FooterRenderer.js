import { t } from '../i18n.js';
import { pdfColors } from './colors.js';
import { pdfFonts } from './fonts.js';
import RichTextRenderer from './RichTextRenderer.js';

export default class FooterRenderer {
  constructor(doc, pageManager, ciConfig, language, template = {}, data = {}) {
    this.doc = doc;
    this.pm = pageManager;
    this.ci = ciConfig;
    this.template = template || {};
    this.data = data || {};
    this.colors = pdfColors(ciConfig);
    this.fonts = pdfFonts(ciConfig);
    this.lang = language;
    this.richText = new RichTextRenderer();
    this.footerY = this.pm.footerY + 5;
  }

  _drawFooterOnCurrentPage() {
    const y = this.footerY;
    const doc = this.doc;
    const left = this.pm.margins.left;
    const width = this.pm.contentWidth;
    doc.save();
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor(this.colors.border).stroke();
    const footerText = this._footerText();
    if (footerText) {
      this.richText.drawAt(doc, footerText, {
        x: left,
        y: y + 6,
        width: width - 64,
        maxHeight: Math.max(12, this.pm.footerHeight - 8),
        colors: this.colors,
        fonts: this.fonts,
        fontSize: 7,
        lineGap: 2,
        color: this.colors.muted,
      });
    } else {
      doc.font(this.fonts.body).fontSize(7).fillColor(this.colors.muted);
      const company = this.ci?.companyName || 'Updata';
      const vat = this.ci?.companyDetails?.vatNumber || '';
      const bank = this.ci?.companyDetails?.bankDetails?.bankName || '';
      doc.text(`${company} | ${vat} | ${bank}`, left, y + 6, { width: width - 64, align: 'center' });
    }
    doc.restore();
  }

  /**
   * Draw every footer at the very end, once the document knows how many pages
   * it has and which of them carry the QR-bill.
   *
   * Footers used to be painted as each page opened, which put the company line
   * and the page number straight on top of the payment part — the Swiss
   * QR-bill requires that area to stay free of any other content. Deferring
   * the whole footer is what lets those pages be skipped.
   */
  render({ skipPages = [] } = {}) {
    const range = this.doc.bufferedPageRange();
    const totalPages = range.count;
    const skip = new Set(skipPages);

    for (let i = 0; i < totalPages; i += 1) {
      if (skip.has(i)) continue;
      this.doc.switchToPage(range.start + i);
      this._drawFooterOnCurrentPage();

      const y = this.footerY + 6;
      const left = this.pm.margins.left;
      const width = this.pm.contentWidth;
      this.doc.save();
      this.doc.font(this.fonts.body).fontSize(7).fillColor(this.colors.muted);
      this.doc.text(
        `${t(this.lang, 'page')} ${i + 1} ${t(this.lang, 'of')} ${totalPages}`,
        left + width - 60, y, { width: 60, align: 'right' },
      );
      this.doc.restore();
    }
  }

  _footerText() {
    const textBlocks = this.data.textBlocks || this.template.textBlocks || {};
    return this.data.footerText || textBlocks?.[this.lang]?.footer || '';
  }
}
