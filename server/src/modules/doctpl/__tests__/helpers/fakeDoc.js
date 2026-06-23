// Lightweight chainable fake of a PDFKit document for renderer unit tests.
// Records every text() call so tests can assert on rendered strings without
// parsing a real PDF binary.

export function createFakeDoc() {
  const calls = { text: [], image: [] };
  const doc = {
    page: { width: 595.28, height: 841.89 },
    y: 0,
    _events: {},
    save() { return this; },
    restore() { return this; },
    font() { return this; },
    fontSize() { return this; },
    fillColor() { return this; },
    strokeColor() { return this; },
    lineWidth() { return this; },
    moveTo() { return this; },
    lineTo() { return this; },
    rect() { return this; },
    fill() { return this; },
    stroke() { return this; },
    moveDown() { return this; },
    image(src, x, y, opts) { calls.image.push({ src, x, y, opts }); return this; },
    text(value, x, y, opts) { calls.text.push({ value: String(value ?? ''), x, y, opts }); return this; },
    heightOfString() { return 12; },
    widthOfString() { return 20; },
    on(event, cb) { this._events[event] = cb; return this; },
    addPage() { if (this._events.pageAdded) this._events.pageAdded(); return this; },
    bufferedPageRange() { return { start: 0, count: 1 }; },
    switchToPage() { return this; },
    end() { return this; },
  };
  doc.__calls = calls;
  doc.__texts = () => calls.text.map((c) => c.value);
  doc.__renderedText = () => calls.text.map((c) => c.value).join('\n');
  return doc;
}

export function createFakePageManager(overrides = {}) {
  const margins = overrides.margins || { top: 70, bottom: 56, left: 56, right: 42 };
  let currentY = overrides.currentY ?? margins.top;
  return {
    margins,
    contentWidth: overrides.contentWidth ?? 497,
    footerY: overrides.footerY ?? 760,
    footerHeight: overrides.footerHeight ?? 40,
    pageCount: 1,
    get currentY() { return currentY; },
    set currentY(v) { currentY = v; },
    setY(v) { currentY = v; },
    moveDown(amount = 12) { currentY += amount; },
    checkSpace() { return false; },
    addPage() { return false; },
    ...overrides.methods,
  };
}
