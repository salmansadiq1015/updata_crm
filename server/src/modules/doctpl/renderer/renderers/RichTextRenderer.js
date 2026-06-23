const MM_TO_PT = 2.83465;

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value = '') {
  return `${value}`.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith('#x')) {
      return String.fromCharCode(Number.parseInt(key.slice(2), 16));
    }
    if (key.startsWith('#')) {
      return String.fromCharCode(Number.parseInt(key.slice(1), 10));
    }
    return ENTITY_MAP[key] ?? '';
  });
}

function stripUnsafeHtml(value = '') {
  return `${value}`
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}

function normalizeText(value = '') {
  return decodeEntities(value).replace(/\s+/g, ' ');
}

function tagName(token = '') {
  const match = token.match(/^<\/?\s*([a-z0-9]+)/i);
  return match ? match[1].toLowerCase() : '';
}

function createBlock(type = 'paragraph', listType = null) {
  return { type, listType, segments: [] };
}

function blockText(block) {
  return block.segments.map((segment) => segment.text).join('').trim();
}

function finishBlock(block, blocks) {
  const text = blockText(block);
  if (!text) return createBlock();
  const segments = block.segments.map((segment) => ({ ...segment }));
  if (segments.length) {
    segments[0].text = segments[0].text.replace(/^\s+/, '');
    segments[segments.length - 1].text = segments[segments.length - 1].text.replace(/\s+$/, '');
  }
  blocks.push({
    ...block,
    segments: segments.filter((segment) => segment.text),
  });
  return createBlock();
}

function addSegment(block, text, style) {
  const normalized = normalizeText(text);
  if (!normalized.trim()) return;
  const last = block.segments.at(-1);
  if (last && last.bold === style.bold && last.italic === style.italic) {
    last.text += normalized;
    return;
  }
  block.segments.push({ text: normalized, bold: style.bold, italic: style.italic });
}

export function parseRichText(input = '') {
  const raw = stripUnsafeHtml(input).trim();
  if (!raw) return [];

  if (!/<[a-z][\s\S]*>/i.test(raw)) {
    return raw
      .split(/\n{2,}/)
      .map((text) => normalizeText(text).trim())
      .filter(Boolean)
      .map((text) => ({ type: 'paragraph', listType: null, segments: [{ text, bold: false, italic: false }] }));
  }

  const blocks = [];
  let block = createBlock();
  const style = { bold: false, italic: false };
  let listType = null;
  const tokens = raw.replace(/<br\s*\/?>/gi, '\n').match(/<[^>]+>|[^<]+/g) || [];

  for (const token of tokens) {
    if (!token.startsWith('<')) {
      addSegment(block, token, style);
      continue;
    }

    const closing = /^<\//.test(token);
    const name = tagName(token);

    if (name === 'strong' || name === 'b') {
      style.bold = !closing;
      continue;
    }
    if (name === 'em' || name === 'i') {
      style.italic = !closing;
      continue;
    }
    if (name === 'ul' || name === 'ol') {
      if (!closing) listType = name === 'ol' ? 'ordered' : 'bullet';
      if (closing) listType = null;
      continue;
    }
    if (name === 'li') {
      if (closing) {
        block = finishBlock(block, blocks);
      } else {
        block = finishBlock(block, blocks);
        block = createBlock('listItem', listType || 'bullet');
      }
      continue;
    }
    if (['p', 'div', 'h1', 'h2', 'h3'].includes(name)) {
      if (block.type === 'listItem') continue;
      if (closing) {
        block = finishBlock(block, blocks);
      } else {
        block = finishBlock(block, blocks);
        block = createBlock(name.startsWith('h') ? 'heading' : 'paragraph');
      }
    }
  }

  finishBlock(block, blocks);
  return blocks;
}

export function richTextToPlainText(input = '') {
  return parseRichText(input)
    .map((block) => `${block.type === 'listItem' ? '- ' : ''}${blockText(block)}`)
    .join('\n');
}

export default class RichTextRenderer {
  draw(doc, pm, html, options = {}) {
    const blocks = parseRichText(html);
    let drawnHeight = 0;
    for (const block of blocks) {
      const width = options.width || pm.contentWidth;
      const height = this.measureBlock(doc, block, width, options);
      pm.checkSpace(height + (options.lineGap ?? 5));
      this.drawBlockAt(doc, block, {
        ...options,
        x: options.x ?? pm.margins.left,
        y: pm.currentY,
        width,
      });
      const advance = height + (options.lineGap ?? 5);
      pm.moveDown(advance);
      drawnHeight += advance;
    }
    return drawnHeight;
  }

  drawAt(doc, html, options = {}) {
    const blocks = parseRichText(html);
    let currentY = options.y || 0;
    const startY = currentY;
    const maxHeight = options.maxHeight ?? Number.POSITIVE_INFINITY;

    for (const block of blocks) {
      const height = this.measureBlock(doc, block, options.width, options);
      if (currentY + height > startY + maxHeight) break;
      this.drawBlockAt(doc, block, { ...options, y: currentY });
      currentY += height + (options.lineGap ?? 4);
    }

    return currentY - startY;
  }

  measureBlock(doc, block, width, options = {}) {
    const text = blockText(block);
    if (!text) return 0;
    const fontSize = options.fontSize ?? (block.type === 'heading' ? 12 : 10);
    const bulletIndent = block.type === 'listItem' ? (options.bulletIndent ?? 5 * MM_TO_PT) : 0;
    const measureWidth = Math.max(20, Number(width || 100) - bulletIndent);
    const fonts = options.fonts || {};

    doc.save();
    doc.font(block.segments.some((segment) => segment.bold) ? fonts.bold || 'Helvetica-Bold' : fonts.body || 'Helvetica');
    doc.fontSize(fontSize);
    const height = doc.heightOfString(text, { width: measureWidth });
    doc.restore();
    return Math.max(fontSize + 2, Math.ceil(height));
  }

  drawBlockAt(doc, block, options = {}) {
    const text = blockText(block);
    if (!text) return;

    const fonts = options.fonts || {};
    const colors = options.colors || {};
    const fontSize = options.fontSize ?? (block.type === 'heading' ? 12 : 10);
    const x = options.x || 0;
    const y = options.y || 0;
    const bulletIndent = block.type === 'listItem' ? (options.bulletIndent ?? 5 * MM_TO_PT) : 0;
    const contentX = x + bulletIndent;
    const width = Math.max(20, Number(options.width || 100) - bulletIndent);
    const color = options.color || colors.text || '#111111';

    doc.save();
    if (block.type === 'listItem') {
      doc.font(fonts.body || 'Helvetica').fontSize(fontSize).fillColor(color);
      doc.text(block.listType === 'ordered' ? '1.' : '-', x, y, { width: bulletIndent - 2, align: 'left' });
    }

    const segments = block.segments.filter((segment) => segment.text);
    segments.forEach((segment, index) => {
      doc.font(this._fontForSegment(segment, fonts, block))
        .fontSize(fontSize)
        .fillColor(color);
      const continued = index < segments.length - 1;
      if (index === 0) {
        doc.text(segment.text, contentX, y, { width, continued });
      } else {
        doc.text(segment.text, { continued });
      }
    });

    if (segments.length > 1) {
      doc.text('', { continued: false });
    }
    doc.restore();
  }

  _fontForSegment(segment, fonts, block) {
    if (block.type === 'heading' || segment.bold) return fonts.bold || 'Helvetica-Bold';
    if (segment.italic) return fonts.italic || 'Helvetica-Oblique';
    return fonts.body || 'Helvetica';
  }
}
