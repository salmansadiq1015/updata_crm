export const MIGRATION_DOMAINS = [
  'addresses_of',
  'addresses_messerli',
  'plants',
  'quotations',
  'invoices',
  'documents',
  'maintenance_history',
];

export const EXECUTABLE_DOMAINS = [
  'addresses_of',
  'addresses_messerli',
  'plants',
  'quotations',
  'invoices',
];

export const RUN_TYPES = ['dry_run', 'production'];
export const RUN_ENVIRONMENTS = ['staging', 'production'];
export const RUN_STATUSES = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'rolled_back'];
export const DOMAIN_STATUSES = ['pending', 'running', 'completed', 'failed', 'paused', 'skipped'];
export const SOURCE_SYSTEMS = ['of', 'messerli', 'other'];
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
export const RECORD_ACTIONS = ['created', 'merged', 'updated', 'skipped', 'rolled_back'];
export const ROLLBACK_TYPES = ['full', 'partial'];

export const DEFAULT_BATCH_SIZE = 500;
export const DEFAULT_ERROR_THRESHOLD_PERCENT = 5;

export const DOMAIN_SOURCE_SYSTEM = {
  addresses_of: 'of',
  addresses_messerli: 'messerli',
  plants: 'of',
  quotations: 'of',
  invoices: 'of',
  documents: 'of',
  maintenance_history: 'of',
};

export const DOMAIN_SOURCE_TABLE = {
  addresses_of: 'adressen',
  addresses_messerli: 'kontakte',
  plants: 'anlagen',
  quotations: 'offerten',
  invoices: 'rechnungen',
  documents: 'documents',
  maintenance_history: 'wartungen',
};

export const TARGET_TABLES = {
  customers: 'Customer',
  contacts: 'Contact',
  sites: 'Site',
  installations: 'Installation',
  quotations: 'Quotation',
  invoices: 'Invoice',
};
