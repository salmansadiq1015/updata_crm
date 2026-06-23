import {
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import BodyRenderer from '../renderer/renderers/BodyRenderer.js';
import TermsRenderer from '../renderer/renderers/TermsRenderer.js';
import { parseRichText, richTextToPlainText } from '../renderer/renderers/RichTextRenderer.js';

function fakeDoc() {
  return {
    operations: [],
    save() { this.operations.push(['save']); return this; },
    restore() { this.operations.push(['restore']); return this; },
    font(value) { this.operations.push(['font', value]); return this; },
    fontSize(value) { this.operations.push(['fontSize', value]); return this; },
    fillColor(value) { this.operations.push(['fillColor', value]); return this; },
    heightOfString(value) { return Math.max(10, String(value || '').length / 4); },
    text(value) { this.operations.push(['text', value]); return this; },
  };
}

function fakePageManager() {
  return {
    margins: { left: 40 },
    contentWidth: 360,
    currentY: 100,
    checkSpace: jest.fn(),
    moveDown(value) { this.currentY += value; },
  };
}

function textOperations(doc) {
  return doc.operations
    .filter(([operation]) => operation === 'text')
    .map(([, value]) => value);
}

describe('DocTpl rich text PDF rendering', () => {
  test('parses TipTap rich text into styled paragraphs and list items without raw HTML', () => {
    const blocks = parseRichText('<p>Hello <strong>World</strong> and <em>Team</em></p><ul><li>First item</li></ul>');

    expect(blocks).toHaveLength(2);
    expect(blocks[0].segments).toEqual([
      { text: 'Hello ', bold: false, italic: false },
      { text: 'World', bold: true, italic: false },
      { text: ' and ', bold: false, italic: false },
      { text: 'Team', bold: false, italic: true },
    ]);
    expect(blocks[1]).toMatchObject({ type: 'listItem', listType: 'bullet' });
    expect(richTextToPlainText('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
  });

  test('renders body and terms from template text blocks when source data has no override', () => {
    const doc = fakeDoc();
    const pm = fakePageManager();
    const template = {
      textBlocks: {
        de: {
          introduction: '<p>Intro <strong>fett</strong></p>',
          terms: '<ul><li>Zahlbar innert 30 Tagen</li></ul>',
        },
      },
    };

    new BodyRenderer().draw(doc, pm, {}, {}, 'de', { template });
    new TermsRenderer().draw(doc, pm, {}, {}, 'de', { template });

    const text = textOperations(doc).join(' ');
    expect(text).toContain('Intro ');
    expect(text).toContain('fett');
    expect(text).toContain('Zahlbar innert 30 Tagen');
    expect(text).not.toContain('<strong>');
    expect(text).not.toContain('<li>');
  });
});
