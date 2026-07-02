export const MIGRATION_DOMAINS = [
  { value: 'addresses_of', labelKey: 'migration.domain.addressesOf' },
  { value: 'addresses_messerli', labelKey: 'migration.domain.addressesMesserli' },
  { value: 'plants', labelKey: 'migration.domain.plants' },
  { value: 'quotations', labelKey: 'migration.domain.quotations' },
  { value: 'invoices', labelKey: 'migration.domain.invoices' },
];

export const RUN_STATUSES = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'rolled_back'];
export const ISSUE_SEVERITIES = ['error', 'warning', 'info'];
export const ERROR_TYPES = [
  'validation_failed',
  'mapping_error',
  'ref_integrity',
  'format_error',
  'duplicate',
  'financial_mismatch',
  'unknown',
];

export const STATUS_STYLES = {
  pending: 'bg-slate-500/10 text-slate-700 border-slate-500/20 dark:text-slate-300',
  running: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300',
  paused: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
  completed: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
  failed: 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300',
  cancelled: 'bg-muted text-muted-foreground border-border',
  rolled_back: 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-300',
  skipped: 'bg-muted text-muted-foreground border-border',
};
