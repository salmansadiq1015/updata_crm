import type { LeadSla, SlaStatus } from '../types/lead-workflow-types';

const SLA_STATUSES: SlaStatus[] = ['none', 'pending', 'met', 'overdue', 'late'];
const iso = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

/** Assignment + first-response SLA fields from a raw lead payload (all optional server-side). */
const SLA_KEYS = ['slaStatus', 'assignedAt', 'firstResponseDueAt', 'firstRespondedAt', 'assignmentSource'];

export function readLeadSla(raw: Record<string, unknown>): LeadSla | undefined {
  if (!SLA_KEYS.some((k) => raw[k] !== undefined)) return undefined;
  const status = SLA_STATUSES.find((s) => s === raw.slaStatus) ?? 'none';
  const source = raw.assignmentSource;
  return {
    assignedAt: iso(raw.assignedAt),
    assignmentSource: source === 'manual' || source === 'auto' || source === 'import' ? source : null,
    firstResponseDueAt: iso(raw.firstResponseDueAt),
    firstRespondedAt: iso(raw.firstRespondedAt),
    firstResponseChannel: typeof raw.firstResponseChannel === 'string' ? raw.firstResponseChannel : null,
    slaStatus: status,
    escalationLevel: typeof raw.escalationLevel === 'number' && raw.escalationLevel > 0 ? raw.escalationLevel : 0,
  };
}
