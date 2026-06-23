const MM_TO_PT = 2.83465;

export default class PageManager {
  constructor(doc, margins, layout = {}) {
    this.doc = doc;
    this.footerHeight = Number(layout.footerHeight ?? 30) * MM_TO_PT;
    this.margins = {
      top: (margins.top || 25) * MM_TO_PT,
      bottom: (margins.bottom || 20) * MM_TO_PT,
      left: (margins.left || 20) * MM_TO_PT,
      right: (margins.right || 15) * MM_TO_PT,
    };
    this.pageHeight = doc.page.height;
    this.pageWidth = doc.page.width;
    this.currentY = this.margins.top;
    this.pageCount = 1;
    this.footerY = this.pageHeight - this.margins.bottom - this.footerHeight;
  }

  get contentWidth() {
    return this.pageWidth - this.margins.left - this.margins.right;
  }

  get availableHeight() {
    return this.footerY - this.currentY;
  }

  checkSpace(requiredPts) {
    if (this.currentY + requiredPts > this.footerY) {
      this.addPage();
      return true;
    }
    return false;
  }

  addPage() {
    this.doc.addPage();
    this.pageCount++;
    this.currentY = this.margins.top;
  }

  moveDown(pts) {
    this.currentY += pts;
    this.doc.y = this.currentY;
  }

  setY(y) {
    this.currentY = y;
    this.doc.y = y;
  }
}
