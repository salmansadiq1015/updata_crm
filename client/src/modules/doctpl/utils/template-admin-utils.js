import {
  TEMPLATE_ADMIN_DEFAULT_SORT,
  TEMPLATE_ADMIN_LIMIT,
  TEMPLATE_TYPE_FILTER_OPTIONS,
} from '../constants/template-admin';
import { getSwissDateLocale } from './localization';

const EMPTY_TEMPLATES = [];
const EMPTY_PAGINATION = {};
const CI_SCORE = {
  passed: 100,
  warning: 70,
  failed: 35,
  unknown: 0,
};

export function buildTemplateFilters({
  cursor,
  search,
  typeFilter,
  statusFilter,
  sortValue,
}) {
  const [sortBy, sortOrder] = String(sortValue || TEMPLATE_ADMIN_DEFAULT_SORT).split(':');
  return {
    limit: TEMPLATE_ADMIN_LIMIT,
    sortBy,
    sortOrder,
    ...(cursor ? { cursor } : {}),
    ...(typeFilter && typeFilter !== 'all' ? { templateType: typeFilter } : {}),
    ...(statusFilter === 'active' ? { isActive: true } : {}),
    ...(statusFilter === 'inactive' ? { isActive: false } : {}),
    ...(search?.trim() ? { search: search.trim() } : {}),
  };
}

export function normalizeTemplatePage(data) {
  return {
    templates: Array.isArray(data?.items) ? data.items : EMPTY_TEMPLATES,
    pagination: data?.pagination || EMPTY_PAGINATION,
  };
}

export function buildTemplateTypeOptions(templates) {
  const known = new Map(TEMPLATE_TYPE_FILTER_OPTIONS);
  for (const template of templates || EMPTY_TEMPLATES) {
    if (template?.templateType && !known.has(template.templateType)) {
      known.set(template.templateType, `doctpl.type.${template.templateType}`);
    }
  }
  return [...known.entries()];
}

export function getTemplateAuditStatus(template, auditTemplates) {
  const templateId = String(template?._id || '');
  const match = (auditTemplates || EMPTY_TEMPLATES).find((item) => String(item?.templateId || '') === templateId);
  return match?.status || 'unknown';
}

export function buildTemplateStats(templates, auditSummary) {
  const rows = templates || EMPTY_TEMPLATES;
  const total = Number(auditSummary?.templates ?? rows.length);
  const active = Number(auditSummary?.activeTemplates ?? rows.filter((template) => template?.isActive).length);
  const types = new Set(rows.map((template) => template?.templateType).filter(Boolean)).size;
  const issueCount = Number(auditSummary?.issues ?? 0);
  const ciStatus = auditSummary?.status || 'unknown';
  const ciReadiness = CI_SCORE[ciStatus] ?? CI_SCORE.unknown;

  return {
    total,
    active,
    inactive: Math.max(total - active, 0),
    types,
    issueCount,
    ciStatus,
    ciReadiness,
  };
}

export function formatTemplateDate(value, locale) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(getSwissDateLocale(locale));
}

export function countVisibleSections(template) {
  return (template?.sections || []).filter((section) => section?.isVisible !== false).length;
}

export function countTableColumns(template) {
  return Array.isArray(template?.tableColumns) ? template.tableColumns.length : 0;
}

export function getTemplateDisplayVersion(template) {
  return `v${template?.currentVersion || 1}`;
}

export function hasTemplateAdminFilters({ search, typeFilter, statusFilter }) {
  return Boolean(search?.trim() || typeFilter !== 'all' || statusFilter !== 'all');
}
