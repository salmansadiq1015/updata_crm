import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Layers3,
  ShieldCheck,
} from 'lucide-react';
import { BUILT_IN_TEMPLATE_TYPES } from '../utils/template-defaults';

export const TEMPLATE_ADMIN_LIMIT = 24;
export const TEMPLATE_ADMIN_DEFAULT_SORT = 'createdAt:desc';
export const TEMPLATE_ADMIN_DEFAULT_VIEW = 'cards';

export const TEMPLATE_TYPE_FILTER_OPTIONS = [
  ['all', 'doctpl.templates.allTypes'],
  ...BUILT_IN_TEMPLATE_TYPES,
];

export const TEMPLATE_STATUS_OPTIONS = [
  ['all', 'doctpl.templates.allStatuses'],
  ['active', 'doctpl.templates.active'],
  ['inactive', 'doctpl.templates.inactive'],
];

export const TEMPLATE_SORT_OPTIONS = [
  ['createdAt:desc', 'doctpl.templates.newestFirst'],
  ['createdAt:asc', 'doctpl.templates.oldestFirst'],
  ['name:asc', 'doctpl.templates.nameAsc'],
  ['templateType:asc', 'doctpl.templates.typeAsc'],
];

export const TEMPLATE_VIEW_OPTIONS = [
  ['cards', 'doctpl.templates.viewCards', Layers3],
  ['table', 'doctpl.templates.viewTable', Activity],
];

export const TEMPLATE_CI_STATUS_META = {
  passed: {
    labelKey: 'doctpl.templates.ciPassed',
    badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  warning: {
    labelKey: 'doctpl.templates.ciWarning',
    badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
    icon: AlertTriangle,
  },
  failed: {
    labelKey: 'doctpl.templates.ciFailed',
    badgeClassName: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
    icon: AlertTriangle,
  },
  unknown: {
    labelKey: 'doctpl.templates.ciNotChecked',
    badgeClassName: 'border-border bg-muted/60 text-muted-foreground',
    icon: Clock3,
  },
};

export const TEMPLATE_ADMIN_STATS = [
  {
    id: 'total',
    labelKey: 'doctpl.templates.statTotal',
    descriptionKey: 'doctpl.templates.statTotalDesc',
    valueKey: 'total',
    icon: FileText,
    className: 'text-sky-600 dark:text-sky-300',
  },
  {
    id: 'active',
    labelKey: 'doctpl.templates.statActive',
    descriptionKey: 'doctpl.templates.statActiveDesc',
    valueKey: 'active',
    icon: CheckCircle2,
    className: 'text-emerald-600 dark:text-emerald-300',
  },
  {
    id: 'types',
    labelKey: 'doctpl.templates.statTypes',
    descriptionKey: 'doctpl.templates.statTypesDesc',
    valueKey: 'types',
    icon: Layers3,
    className: 'text-indigo-600 dark:text-indigo-300',
  },
  {
    id: 'ci',
    labelKey: 'doctpl.templates.statCi',
    descriptionKey: 'doctpl.templates.statCiDesc',
    valueKey: 'ciReadiness',
    icon: ShieldCheck,
    className: 'text-amber-600 dark:text-amber-300',
    suffix: '%',
  },
];

export const DOCTPL_TEMPLATE_ADMIN_I18N_KEYS = [
  'doctpl.templates.title',
  'doctpl.templates.description',
  'doctpl.templates.ciConfiguration',
  'doctpl.templates.empty',
  'doctpl.templates.noResults',
  'doctpl.templates.clearFilters',
  'doctpl.templates.createFirst',
  'doctpl.templates.edit',
  'doctpl.templates.active',
  'doctpl.templates.inactive',
  'doctpl.templates.activate',
  'doctpl.templates.deactivate',
  'doctpl.templates.activated',
  'doctpl.templates.deactivated',
  'doctpl.templates.search',
  'doctpl.templates.searchPlaceholder',
  'doctpl.templates.allTypes',
  'doctpl.templates.allStatuses',
  'doctpl.templates.newestFirst',
  'doctpl.templates.oldestFirst',
  'doctpl.templates.nameAsc',
  'doctpl.templates.typeAsc',
  'doctpl.templates.duplicate',
  'doctpl.templates.duplicated',
  'doctpl.templates.delete',
  'doctpl.templates.deleted',
  'doctpl.templates.deleteTitle',
  'doctpl.templates.deleteDescription',
  'doctpl.templates.deleteConfirm',
  'doctpl.templates.loadFailed',
  'doctpl.templates.refreshing',
  'doctpl.templates.pageCount',
  'doctpl.templates.create',
  'doctpl.templates.created',
  'doctpl.templates.kicker',
  'doctpl.templates.summary',
  'doctpl.templates.statTotal',
  'doctpl.templates.statTotalDesc',
  'doctpl.templates.statActive',
  'doctpl.templates.statActiveDesc',
  'doctpl.templates.statTypes',
  'doctpl.templates.statTypesDesc',
  'doctpl.templates.statCi',
  'doctpl.templates.statCiDesc',
  'doctpl.templates.activeRatio',
  'doctpl.templates.issueCount',
  'doctpl.templates.toolbarTitle',
  'doctpl.templates.toolbarDescription',
  'doctpl.templates.typeLabel',
  'doctpl.templates.statusLabel',
  'doctpl.templates.sortLabel',
  'doctpl.templates.viewCards',
  'doctpl.templates.viewTable',
  'doctpl.templates.version',
  'doctpl.templates.updated',
  'doctpl.templates.sections',
  'doctpl.templates.columns',
  'doctpl.templates.ciPassed',
  'doctpl.templates.ciWarning',
  'doctpl.templates.ciFailed',
  'doctpl.templates.ciNotChecked',
  'doctpl.templates.openEditor',
  'doctpl.templates.duplicateTemplate',
  'doctpl.templates.activateTemplate',
  'doctpl.templates.deactivateTemplate',
  'doctpl.templates.archiveTemplate',
  'doctpl.templates.refresh',
  'doctpl.templates.retryLoad',
  'doctpl.templates.emptyTitle',
  'doctpl.templates.emptyDescription',
  'doctpl.templates.noResultsTitle',
  'doctpl.templates.noResultsDescription',
  'doctpl.templates.readOnly',
  'doctpl.templates.tableTemplate',
  'doctpl.templates.tableType',
  'doctpl.templates.tableStatus',
  'doctpl.templates.tableVersion',
  'doctpl.templates.tableUpdated',
  'doctpl.templates.tableCi',
  'doctpl.templates.tableActions',
];
