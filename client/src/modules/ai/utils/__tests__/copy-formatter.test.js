import { toMarkdown, toPlainText } from '../copy-formatter';

describe('toMarkdown', () => {
  it('returns string content unchanged', () => {
    expect(toMarkdown('**hello**')).toBe('**hello**');
  });
  it('serializes objects to JSON', () => {
    expect(toMarkdown({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('toPlainText', () => {
  it('strips bold markers', () => {
    expect(toPlainText('**bold**')).toBe('bold');
  });
  it('strips italic markers', () => {
    expect(toPlainText('*italic*')).toBe('italic');
  });
  it('strips headings', () => {
    expect(toPlainText('## Title')).toBe('Title');
  });
  it('strips blockquotes', () => {
    expect(toPlainText('> quote')).toBe('quote');
  });
  it('converts list markers to bullets', () => {
    expect(toPlainText('- item')).toBe('• item');
  });
  it('strips horizontal rules', () => {
    expect(toPlainText('---')).toBe('');
  });
  it('strips inline code backticks', () => {
    expect(toPlainText('`code`')).toBe('code');
  });
  it('adds language comment to fenced code blocks', () => {
    const md = '```js\nconsole.log(1);\n```';
    expect(toPlainText(md)).toBe('// js\nconsole.log(1);');
  });
  it('strips link syntax, keeps text', () => {
    expect(toPlainText('[click here](https://example.com)')).toBe('click here');
  });
});
