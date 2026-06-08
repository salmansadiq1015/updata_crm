export const MIGRATION_DOMAINS = [
  { value: 'addresses_of', label: 'OF Adressen' },
  { value: 'addresses_messerli', label: 'Messerli Kontakte' },
  { value: 'plants', label: 'Anlagen' },
  { value: 'quotations', label: 'Offerten' },
  { value: 'invoices', label: 'Rechnungen' },
];

export const RUN_STATUSES = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'rolled_back'];

export const STATUS_STYLES = {
  pending: 'bg-slate-500/10 text-slate-700 border-slate-500/20',
  running: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  paused: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-700 border-red-500/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
  rolled_back: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
};
