import { t } from '../i18n.js';
import { pdfColors } from './colors.js';
import { pdfFonts } from './fonts.js';
import RichTextRenderer from './RichTextRenderer.js';

export default class BodyRenderer {
  constructor() {
    this.richText = new RichTextRenderer();
  }

  draw(doc, pm, ciConfig, data, language, config = {}) {
    const textBlocks = data.textBlocks || config.template?.textBlocks || {};
    const colors = pdfColors(ciConfig);
    const fonts = pdfFonts(ciConfig);

    // Milestone / partial-delivery description (advance invoices, DOC-003).
    if (data.milestoneDescription) {
      pm.checkSpace(30);
      doc.save().font(fonts.bold).fontSize(10).fillColor(colors.primary);
      doc.text(t(language, 'milestone'), pm.margins.left, pm.currentY, { width: pm.contentWidth });
      doc.restore();
      pm.moveDown(14);
      this.richText.draw(doc, pm, data.milestoneDescription, {
        colors,
        fonts,
        fontSize: 10,
        lineGap: 5,
      });
      pm.moveDown(6);
    }

    const text = data.introduction || textBlocks?.[language]?.introduction || '';
    if (!text) return;
    pm.checkSpace(30);
    this.richText.draw(doc, pm, text, {
      colors,
      fonts,
      fontSize: 10,
      lineGap: 5,
    });
  }
}
