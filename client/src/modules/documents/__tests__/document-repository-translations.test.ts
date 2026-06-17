import { describe, expect, test } from 'vitest';
import { translations } from '@/lib/i18n/translations';
import {
  DOCUMENT_CATEGORY_OPTIONS,
  DOCUMENT_ORIGIN_OPTIONS,
  DOCUMENT_SOURCE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  LINK_TYPE_OPTIONS,
} from '../utils/document-formatters';

const locales = ['de', 'en', 'fr', 'it'] as const;

const repositoryKeys = [
  'documents.repository.titlePage',
  'documents.repository.pageDescription',
  'documents.repository.upload',
  'documents.repository.uploadTitle',
  'documents.repository.uploadDescription',
  'documents.repository.selectFileHelp',
  'documents.repository.selectFileFirst',
  'documents.repository.uploaded',
  'documents.repository.deleted',
  'documents.repository.noDownloadUrl',
  'documents.repository.searchPlaceholder',
  'documents.repository.loadFailed',
  'documents.repository.tryRefresh',
  'documents.repository.emptyTitle',
  'documents.repository.emptyDescription',
  'documents.repository.document',
  'documents.repository.source',
  'documents.repository.type',
  'documents.repository.links',
  'documents.repository.date',
  'documents.repository.size',
  'documents.repository.unlinked',
  'documents.repository.untitled',
  'documents.repository.deleteBlocked',
  'documents.repository.deleteTitle',
  'documents.repository.deleteDescription',
  'documents.repository.refreshing',
  'documents.repository.pageCount',
  'documents.repository.dateFrom',
  'documents.repository.dateTo',
  'documents.repository.newest',
  'documents.repository.oldest',
  'documents.repository.title',
  'documents.repository.optionalTitle',
  'documents.repository.documentType',
  'documents.repository.category',
  'documents.repository.folder',
  'documents.repository.directLink',
  'documents.repository.linkedRecordId',
  'documents.repository.recordIdPlaceholder',
  'documents.repository.customerId',
  'documents.repository.projectId',
  'documents.repository.jobId',
  'documents.repository.employeeId',
  'documents.repository.descriptionField',
  'documents.repository.unknownFileType',
  ...DOCUMENT_SOURCE_OPTIONS.map((option) => option.labelKey),
  ...DOCUMENT_ORIGIN_OPTIONS.map((option) => option.labelKey),
  ...LINK_TYPE_OPTIONS.map((option) => option.labelKey),
  ...DOCUMENT_TYPE_OPTIONS.map((option) => option.labelKey),
  ...DOCUMENT_CATEGORY_OPTIONS.map((option) => option.labelKey),
] as const;

describe('document repository translations', () => {
  test('has repository keys in all supported locales', () => {
    for (const locale of locales) {
      for (const key of repositoryKeys) {
        expect(translations[locale][key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });
});
