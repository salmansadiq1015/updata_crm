import { pdfColors } from './colors.js';
import { pdfFonts } from './fonts.js';

export default class BodyRenderer {
  draw(doc, pm, ciConfig, data, language, _config = {}) {
    const text = data.introduction || data.textBlocks?.[language]?.introduction || '';
    if (!text) return;
    const colors = pdfColors(ciConfig);
    const fonts = pdfFonts(ciConfig);
    pm.checkSpace(30);
    doc.save().font(fonts.body).fontSize(10).fillColor(colors.text);
    doc.text(text, pm.margins.left, pm.currentY, { width: pm.contentWidth });
    pm.moveDown(doc.heightOfString(text, { width: pm.contentWidth }) + 10);
    doc.restore();
  }
}
