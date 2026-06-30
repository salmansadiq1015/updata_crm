import { describe, expect, it } from 'vitest';
import { translations } from '@/lib/i18n/translations';

const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'it'];

const TIME_ACTION_I18N_KEYS = [
  'fieldOps.time.commandLabel',
  'fieldOps.time.actions.import',
  'fieldOps.time.actions.export',
  'fieldOps.time.actions.exporting',
  'fieldOps.time.import.title',
  'fieldOps.time.import.description',
  'fieldOps.time.import.referenceTitle',
  'fieldOps.time.import.downloadTemplate',
  'fieldOps.time.import.downloadingTemplate',
  'fieldOps.time.import.csvFile',
  'fieldOps.time.import.validate',
  'fieldOps.time.import.validating',
  'fieldOps.time.import.importAction',
  'fieldOps.time.import.importing',
  'fieldOps.time.import.rows',
  'fieldOps.time.import.valid',
  'fieldOps.time.import.created',
  'fieldOps.time.import.errors',
  'fieldOps.time.import.row',
  'fieldOps.time.import.field',
  'fieldOps.time.import.message',
  'fieldOps.time.import.ready',
  'fieldOps.time.import.completed',
  'fieldOps.time.import.close',
];

describe('field ops time translations', () => {
  it('has explicit time import and export action keys in every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of TIME_ACTION_I18N_KEYS) {
        expect(translations[locale]?.[key], `${locale}.${key}`).toEqual(expect.any(String));
        expect(translations[locale][key].trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
