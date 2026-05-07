export default class BodyRenderer {
  draw(doc, pm, ciConfig, data, language, config = {}) {
    const text = data.introduction || data.textBlocks?.[language]?.introduction || '';
    if (!text) return;
    pm.checkSpace(30);
    doc.save().fontSize(10).fillColor('#1A1A1A');
    doc.text(text, pm.margins.left, pm.currentY, { width: pm.contentWidth });
    pm.moveDown(doc.heightOfString(text, { width: pm.contentWidth }) + 10);
    doc.restore();
  }
}
