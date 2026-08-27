import { describe, expect, it } from 'vitest';
import { translations } from '@/lib/i18n/translations';

const SUPPORTED_LOCALES = ['de', 'en'];

const ORDER_I18N_KEYS = [
  'fieldOps.orders.title',
  'fieldOps.orders.desc',
  'fieldOps.orders.empty',
  'fieldOps.orders.filterDate',
  'fieldOps.orders.filterStatus',
  'fieldOps.orders.filterType',
  'fieldOps.orders.commandLabel',
  'fieldOps.orders.presets.all',
  'fieldOps.orders.presets.planned',
  'fieldOps.orders.presets.confirmed',
  'fieldOps.orders.presets.inProgress',
  'fieldOps.orders.presets.urgent',
  'fieldOps.orders.presets.next7Days',
  'fieldOps.orders.actions.referenceCsv',
  'fieldOps.orders.actions.import',
  'fieldOps.orders.actions.export',
  'fieldOps.orders.import.title',
  'fieldOps.orders.import.description',
  'fieldOps.orders.import.referenceTitle',
  'fieldOps.orders.import.referenceDescription',
  'fieldOps.orders.import.downloadTemplate',
  'fieldOps.orders.import.downloadingTemplate',
  'fieldOps.orders.import.guardrailsTitle',
  'fieldOps.orders.import.dryRunLabel',
  'fieldOps.orders.import.guardrailsDescription',
  'fieldOps.orders.import.selectFile',
  'fieldOps.orders.import.fileHint',
  'fieldOps.orders.import.removeFile',
  'fieldOps.orders.import.chooseFile',
  'fieldOps.orders.import.resultNeedsFixes',
  'fieldOps.orders.import.resultReady',
  'fieldOps.orders.import.rows',
  'fieldOps.orders.import.valid',
  'fieldOps.orders.import.created',
  'fieldOps.orders.import.rowErrors',
  'fieldOps.orders.import.row',
  'fieldOps.orders.import.field',
  'fieldOps.orders.import.error',
  'fieldOps.orders.import.close',
  'fieldOps.orders.import.processing',
  'fieldOps.orders.import.validateImport',
  'fieldOps.orders.import.createOrders',
];

describe('field ops order translations', () => {
  it('has explicit order management import/export keys in every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of ORDER_I18N_KEYS) {
        expect(translations[locale]?.[key], `${locale}.${key}`).toEqual(expect.any(String));
        expect(translations[locale][key].trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
