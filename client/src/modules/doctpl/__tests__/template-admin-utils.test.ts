import { describe, expect, test } from 'vitest';
import {
  buildTemplateFilters,
  buildTemplateStats,
  buildTemplateTypeOptions,
  countTableColumns,
  countVisibleSections,
  formatTemplateDate,
  getTemplateAuditStatus,
  hasTemplateAdminFilters,
  normalizeTemplatePage,
} from '../utils/template-admin-utils';

describe('template admin utils', () => {
  test('builds server filters with cursor pagination and normalized search', () => {
    expect(buildTemplateFilters({
      cursor: 'cursor-2',
      search: ' invoice ',
      typeFilter: 'invoice_final',
      statusFilter: 'inactive',
      sortValue: 'name:asc',
    })).toEqual({
      limit: 24,
      cursor: 'cursor-2',
      search: 'invoice',
      templateType: 'invoice_final',
      isActive: false,
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  test('normalizes empty API data defensively', () => {
    expect(normalizeTemplatePage(null)).toEqual({ templates: [], pagination: {} });
    expect(normalizeTemplatePage({ items: 'bad', pagination: { hasNext: true } })).toEqual({
      templates: [],
      pagination: { hasNext: true },
    });
  });

  test('builds template type options from built-ins plus unknown backend types', () => {
    const options = buildTemplateTypeOptions([
      { templateType: 'quotation' },
      { templateType: 'custom_warranty_notice' },
    ]);

    expect(options).toContainEqual(['all', 'doctpl.templates.allTypes']);
    expect(options).toContainEqual(['quotation', 'doctpl.type.quotation']);
    expect(options).toContainEqual(['custom_warranty_notice', 'doctpl.type.custom_warranty_notice']);
  });

  test('derives stats from CI audit summary when available', () => {
    expect(buildTemplateStats(
      [{ isActive: true, templateType: 'quotation' }, { isActive: false, templateType: 'invoice_standard' }],
      { templates: 12, activeTemplates: 9, issues: 2, status: 'warning' },
    )).toEqual({
      total: 12,
      active: 9,
      inactive: 3,
      types: 2,
      issueCount: 2,
      ciStatus: 'warning',
      ciReadiness: 70,
    });
  });

  test('matches CI status and template structural counters safely', () => {
    const template = {
      _id: 'tpl-1',
      sections: [{ isVisible: true }, { isVisible: false }, {}],
      tableColumns: [{}, {}],
    };

    expect(getTemplateAuditStatus(template, [{ templateId: 'tpl-1', status: 'failed' }])).toBe('failed');
    expect(countVisibleSections(template)).toBe(2);
    expect(countTableColumns(template)).toBe(2);
  });

  test('handles filters and invalid dates without throwing', () => {
    expect(hasTemplateAdminFilters({ search: 'x', typeFilter: 'all', statusFilter: 'all' })).toBe(true);
    expect(hasTemplateAdminFilters({ search: '', typeFilter: 'all', statusFilter: 'all' })).toBe(false);
    expect(formatTemplateDate('not-a-date', 'en')).toBe('-');
  });
});
