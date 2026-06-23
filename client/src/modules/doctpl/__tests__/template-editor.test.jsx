import { describe, expect, test } from 'vitest';
import { getTemplateEditorIssues } from '../components/TemplateEditor';
import { TEMPLATE_LANGUAGES } from '../components/TemplateEditor/TextBlocksTab';

const labels = { de: 'Text', fr: 'Texte', it: 'Testo', en: 'Text' };

function template(overrides = {}) {
  return {
    templateType: 'cover_letter',
    isActive: true,
    layout: { pageSize: 'A4', margins: { top: 25, bottom: 20, left: 20, right: 15 } },
    sections: [
      { id: 'header', type: 'header', isVisible: true },
      { id: 'body', type: 'body', isVisible: true },
      { id: 'footer', type: 'footer', isVisible: true },
    ],
    textBlocks: {
      de: { footer: 'DE Footer' },
      fr: { footer: 'FR Footer' },
      it: { footer: 'IT Footer' },
      en: { footer: 'EN Footer' },
    },
    tableColumns: [
      { field: 'description', widthPercent: 70, label: labels },
      { field: 'total', widthPercent: 30, label: labels },
    ],
    ...overrides,
  };
}

describe('TemplateEditor validation', () => {
  test('exposes all Module 09 languages', () => {
    expect(TEMPLATE_LANGUAGES.map(([code]) => code)).toEqual(['de', 'fr', 'it', 'en']);
  });

  test('accepts active templates with four-language footer and column labels', () => {
    expect(getTemplateEditorIssues(template())).toEqual([]);
  });

  test('flags missing Italian footer and French column label', () => {
    const issues = getTemplateEditorIssues(template({
      textBlocks: {
        de: { footer: 'DE Footer' },
        fr: { footer: 'FR Footer' },
        it: { footer: '' },
        en: { footer: 'EN Footer' },
      },
      tableColumns: [
        { field: 'description', widthPercent: 70, label: { ...labels, fr: '' } },
        { field: 'total', widthPercent: 30, label: labels },
      ],
    }));

    expect(issues).toContain('doctpl.editor.issueFooter:it');
    expect(issues).toContain('doctpl.editor.issueColumnLabel:1:fr');
  });

  test('flags server-required sections before save', () => {
    const issues = getTemplateEditorIssues(template({
      templateType: 'quotation',
      sections: [
        { id: 'header', type: 'header', isVisible: true },
        { id: 'body', type: 'body', isVisible: true },
        { id: 'footer', type: 'footer', isVisible: true },
      ],
    }));

    expect(issues).toContain('doctpl.editor.issueRequiredSection:table');
    expect(issues).toContain('doctpl.editor.issueRequiredSection:totals');
  });

  test('flags margins outside the allowed range', () => {
    const issues = getTemplateEditorIssues(template({
      layout: { pageSize: 'A4', margins: { top: 60, bottom: 20, left: 20, right: 15 } },
    }));

    expect(issues).toContain('doctpl.editor.issueMarginRange');
  });
});
