import { t } from '../i18n.js';
import { pdfColors } from './colors.js';
import { pdfFonts } from './fonts.js';
import RichTextRenderer from './RichTextRenderer.js';

export default class TermsRenderer {
  constructor() {
    this.richText = new RichTextRenderer();
  }

  draw(doc, pm, ciConfig, data, language, config = {}) {
    const textBlocks = data.textBlocks || config.template?.textBlocks || {};
    const terms = data.termsAndConditions || data.terms || textBlocks?.[language]?.terms || '';
    if (!terms) return;

    const colors = pdfColors(ciConfig);
    const fonts = pdfFonts(ciConfig);

    pm.checkSpace(28);
    doc.save()
      .font(fonts.bold)
      .fontSize(10)
      .fillColor(colors.primary)
      .text(t(language, 'paymentTerms'), pm.margins.left, pm.currentY, { width: pm.contentWidth });
    doc.restore();
    pm.moveDown(15);

    this.richText.draw(doc, pm, terms, {
      colors,
      fonts,
      fontSize: 8,
      lineGap: 4,
    });
  }
}
