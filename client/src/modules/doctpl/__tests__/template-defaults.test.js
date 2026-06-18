import { describe, expect, test } from 'vitest';
import { BUILT_IN_TEMPLATE_TYPES, buildTemplateCreatePayload } from '../utils/template-defaults';

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
});
