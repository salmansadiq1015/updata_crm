import { describe, expect, test } from 'vitest';
import { sanitizePastedHtml } from './sanitize-pasted-html';

describe('sanitizePastedHtml', () => {
  test('drops the typeface, size and colour a Word paste carries along', () => {
    const word = '<p class="MsoNormal"><span style="font-family:Calibri;font-size:14pt;color:#C00000">'
      + 'Viessmann Vitocal 250-A</span></p>';
    const clean = sanitizePastedHtml(word);

    expect(clean).toContain('Viessmann Vitocal 250-A');
    expect(clean).not.toMatch(/font-family|font-size|color|Calibri|14pt/);
    expect(clean).not.toMatch(/class=/);
  });

  test('keeps the structure that carries meaning', () => {
    const clean = sanitizePastedHtml(
      '<h2>Leistungen</h2><ul><li><strong>Montage</strong> und <em>Inbetriebnahme</em></li></ul>',
    );

    expect(clean).toContain('<h2>');
    expect(clean).toContain('<li>');
    expect(clean).toContain('<strong>');
    expect(clean).toContain('<em>');
  });

  test('unwraps span and div rather than losing their text', () => {
    const clean = sanitizePastedHtml('<div><span>Boiler entkalken</span></div>');

    expect(clean).toContain('Boiler entkalken');
    expect(clean).not.toContain('<span');
    expect(clean).not.toContain('<div');
  });

  test('closes the highlight and alignment leaks by removing style', () => {
    const clean = sanitizePastedHtml(
      '<p style="text-align:right"><mark style="background-color:#ff0">Achtung</mark></p>',
    );

    expect(clean).toContain('Achtung');
    expect(clean).not.toContain('text-align');
    expect(clean).not.toContain('background-color');
  });

  test('keeps a link target and a table cell span', () => {
    const clean = sanitizePastedHtml(
      '<table><tr><td colspan="2"><a href="https://example.com">Datenblatt</a></td></tr></table>',
    );

    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('colspan="2"');
  });

  test('handles an empty clipboard', () => {
    expect(sanitizePastedHtml('')).toBe('');
    expect(sanitizePastedHtml(null)).toBe('');
    expect(sanitizePastedHtml(undefined)).toBe('');
  });
});
