import { describe, expect, test } from 'vitest';
import {
  BUILT_IN_TEMPLATE_TYPES,
  buildTemplateCreatePayload,
  getRequiredVisibleSections,
} from '../utils/template-defaults';

describe('DocTpl template defaults', () => {
  test('exposes project document presets with letter-style defaults', () => {
    const presetTypes = BUILT_IN_TEMPLATE_TYPES.map(([value]) => value);

    expect(presetTypes).toEqual(expect.arrayContaining([
      'project_appointment_confirmation',
      'project_status_report',
      'project_completion_certificate',
    ]));

    const payload = buildTemplateCreatePayload({
      name: 'Project status',
      description: '',
      templateType: 'project_status_report',
    });

    expect(payload.sections.map((section) => section.type)).toEqual(['header', 'body', 'footer']);
    expect(payload.tableColumns).toEqual([]);
    expect(Object.keys(payload.textBlocks)).toEqual(['de', 'fr', 'it', 'en']);
  });

  test('adds a toggleable terms section to commercial document presets', () => {
    const payload = buildTemplateCreatePayload({
      name: 'Standard quotation',
      description: '',
      templateType: 'quotation',
    });

    expect(payload.sections.map((section) => section.type)).toEqual([
      'header',
      'body',
      'table',
      'totals',
      'terms',
      'footer',
    ]);
  });

  test('builds active payloads with every server-required visible section', () => {
    for (const [templateType] of BUILT_IN_TEMPLATE_TYPES) {
      const payload = buildTemplateCreatePayload({
        name: `Default ${templateType}`,
        description: '',
        templateType,
      });
      const visibleTypes = new Set(payload.sections
        .filter((section) => section.isVisible !== false)
        .map((section) => section.type));

      for (const requiredType of getRequiredVisibleSections(templateType)) {
        expect(visibleTypes.has(requiredType), `${templateType}:${requiredType}`).toBe(true);
      }
    }
  });

  test('creates advance invoice defaults without line-item columns but with totals and QR bill', () => {
    const payload = buildTemplateCreatePayload({
      name: 'Advance invoice',
      description: '',
      templateType: 'invoice_advance',
    });

    expect(payload.tableColumns).toEqual([]);
    expect(payload.sections.map((section) => section.type)).toEqual([
      'header',
      'body',
      'totals',
      'terms',
      'qr_bill',
      'footer',
    ]);
  });
});
