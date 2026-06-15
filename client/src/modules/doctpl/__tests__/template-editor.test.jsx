import { describe, expect, test } from 'vitest';
import { getTemplateEditorIssues } from '../components/TemplateEditor';
import { TEMPLATE_LANGUAGES } from '../components/TemplateEditor/TextBlocksTab';

const labels = { de: 'Text', fr: 'Texte', it: 'Testo', en: 'Text' };

function template(overrides = {}) {
  return {
    isActive: true,
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
});
