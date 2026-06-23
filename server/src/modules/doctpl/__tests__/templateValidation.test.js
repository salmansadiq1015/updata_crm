import { describe, expect, test } from '@jest/globals';
import { updateTemplateSchema, createTemplateSchema } from '../template.validation.js';

function validateUpdateMargins(margins) {
  return updateTemplateSchema.body.validate({
    changeDescription: 'adjust margins',
    layout: { margins },
  });
}

describe('layout margin validation (DOC-005: 1mm increments)', () => {
  test('rejects fractional margins on update', () => {
    const { error } = validateUpdateMargins({ top: 12.5 });
    expect(error).toBeDefined();
    expect(error.message).toMatch(/margin|integer|whole/i);
  });

  test('accepts whole-millimetre margins on update', () => {
    const { error } = validateUpdateMargins({ top: 12, bottom: 20, left: 20, right: 15 });
    expect(error).toBeUndefined();
  });

  test('rejects fractional margins on create', () => {
    const { error } = createTemplateSchema.body.validate({
      templateType: 'quotation',
      name: 'Q',
      layout: { margins: { left: 19.7 } },
    });
    expect(error).toBeDefined();
  });
});
