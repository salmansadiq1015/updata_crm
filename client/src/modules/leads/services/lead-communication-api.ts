import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/**
 * Device-originated lead communications (mobile app SIM calls / SMS composer)
 * and the lead qualification they feed. Read-only on the web: the records are
 * created by the mobile app. Parsing is tolerant — unknown fields are ignored,
 * absent optional ones become null.
 */

export type LeadCommChannel = 'phone' | 'sms';
export type LeadCommStepStatus = 'ok' | 'skipped' | 'failed';
export type LeadCommStep = { status: LeadCommStepStatus; error: string | null; at: string | null };

export type LeadCommunication = {
  id: string;
  operationId: string;
  channel: LeadCommChannel;
  route: string;
  mode: string;
  state: string;
  destinationField: string;
  destinationMasked: string | null;
  sim: { carrierName: string | null; displayName: string | null; slotIndex: number | null } | null;
  observed: {
    ringingObserved: boolean;
    offhookAt: string | null;
    idleAfterOffhookAt: string | null;
    offhookDurationSec: number | null;
    evidence: 'telephony_events' | 'none';
  };
  outcome: {
    disposition: string;
    connected: 'yes' | 'no' | 'unknown';
    notes: string;
    followUpAt: string | null;
    followUpTimezone: string | null;
    statusChange: string | null;
    doNotContact: boolean;
  } | null;
  sms: { body: string; encoding: string | null; segments: number | null; sendStatus: string } | null;
  receipt: { steps: Partial<Record<string, LeadCommStep | null>>; completedAt: string | null };
  createdByName: string | null;
  createdAt: string | null;
  completedAt: string | null;
};

export type LeadCommunicationPage = {
  data: LeadCommunication[];
  pagination: { hasNext: boolean; nextCursor: string | null };
};

export type LeadQualificationSchemaField = {
  fieldKey: string;
  label: string;
  type: string;
  options: string[];
  helpText: string | null;
};

export type LeadQualificationField = {
  fieldKey: string;
  label: string;
  value: string | number | boolean | null;
  status: 'answered' | 'unknown' | 'refused' | 'not_applicable';
  source: string | null;
  evidence: string | null;
  updatedAt: string | null;
};

export type LeadQualification = {
  schema: LeadQualificationSchemaField[];
  fields: LeadQualificationField[];
};

export type QualificationChange = {
  id: string;
  previous: LeadQualificationField | null;
  current: LeadQualificationField;
  changedAt: string | null;
  communicationId: string | null;
  confidence: number | null;
};

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function creatorName(v: unknown): string | null {
  if (!isRec(v)) return null;
  const name = [str(v.firstName), str(v.lastName)].filter(Boolean).join(' ');
  return name || str(v.email);
}

export function parseLeadCommunication(raw: unknown): LeadCommunication | null {
  if (!isRec(raw)) return null;
  const channel = raw.channel === 'sms' ? 'sms' : raw.channel === 'phone' ? 'phone' : null;
  if (!channel) return null;
  const observed = isRec(raw.observed) ? raw.observed : {};
  const outcome = isRec(raw.outcome) ? raw.outcome : null;
  const sms = isRec(raw.sms) ? raw.sms : null;
  const sim = isRec(raw.sim) ? raw.sim : null;
  const receipt = isRec(raw.receipt) ? raw.receipt : {};
  const steps: Partial<Record<string, LeadCommStep | null>> = {};
  if (isRec(receipt.steps)) {
    for (const [name, step] of Object.entries(receipt.steps)) {
      steps[name] = isRec(step) && typeof step.status === 'string'
        ? { status: step.status as LeadCommStepStatus, error: str(step.error), at: str(step.at) }
        : null;
    }
  }
  const connected = outcome?.connected;
  return {
    id: str(raw.id) ?? str(raw._id) ?? String(raw.operationId ?? ''),
    operationId: String(raw.operationId ?? ''),
    channel,
    route: str(raw.route) ?? '',
    mode: str(raw.mode) ?? 'manual',
    state: str(raw.state) ?? 'started',
    destinationField: str(raw.destinationField) ?? 'phone',
    destinationMasked: str(raw.destinationMasked),
    sim: sim ? { carrierName: str(sim.carrierName), displayName: str(sim.displayName), slotIndex: num(sim.slotIndex) } : null,
    observed: {
      ringingObserved: observed.ringingObserved === true,
      offhookAt: str(observed.offhookAt),
      idleAfterOffhookAt: str(observed.idleAfterOffhookAt),
      offhookDurationSec: num(observed.offhookDurationSec),
      evidence: observed.evidence === 'telephony_events' ? 'telephony_events' : 'none',
    },
    outcome: outcome ? {
      disposition: str(outcome.disposition) ?? 'unknown',
      connected: connected === 'yes' || connected === 'no' ? connected : 'unknown',
      notes: typeof outcome.notes === 'string' ? outcome.notes : '',
      followUpAt: str(outcome.followUpAt),
      followUpTimezone: str(outcome.followUpTimezone),
      statusChange: str(outcome.statusChange),
      doNotContact: outcome.doNotContact === true,
    } : null,
    sms: sms ? {
      body: typeof sms.body === 'string' ? sms.body : '',
      encoding: str(sms.encoding),
      segments: num(sms.segments),
      sendStatus: str(sms.sendStatus) ?? 'unknown',
    } : null,
    receipt: { steps, completedAt: str(receipt.completedAt) },
    createdByName: creatorName(raw.createdBy),
    createdAt: str(raw.createdAt),
    completedAt: str(raw.completedAt),
  };
}

const ANSWER_STATUSES = new Set(['answered', 'unknown', 'refused', 'not_applicable']);

export function parseLeadQualification(raw: unknown): LeadQualification {
  const data = isRec(raw) ? raw : {};
  const schema = (Array.isArray(data.schema) ? data.schema : []).filter(isRec).map((f) => ({
    fieldKey: String(f.fieldKey ?? ''),
    label: str(f.label) ?? String(f.fieldKey ?? ''),
    type: str(f.type) ?? 'short_text',
    options: Array.isArray(f.options) ? f.options.filter((o): o is string => typeof o === 'string') : [],
    helpText: str(f.helpText),
  }));
  const fields = (Array.isArray(data.fields) ? data.fields : []).filter(isRec).map((f) => {
    const value = f.value;
    return {
      fieldKey: String(f.fieldKey ?? ''),
      label: str(f.label) ?? String(f.fieldKey ?? ''),
      value: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null,
      status: (ANSWER_STATUSES.has(String(f.status)) ? f.status : 'unknown') as LeadQualificationField['status'],
      source: str(f.source),
      evidence: str(f.evidence),
      updatedAt: str(f.updatedAt),
    };
  });
  return { schema, fields };
}

type Envelope = { data?: unknown; pagination?: { hasNext?: boolean; nextCursor?: string | null } | null };

export const leadCommunicationApi = {
  async list(leadId: string, cursor?: string | null, limit = 20): Promise<LeadCommunicationPage> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    const response = (await apiClient.get(ENDPOINTS.LEADS.COMMUNICATIONS(leadId), { params })) as Envelope;
    const rows = Array.isArray(response.data) ? response.data : [];
    return {
      data: rows.map(parseLeadCommunication).filter((c): c is LeadCommunication => c !== null),
      pagination: {
        hasNext: Boolean(response.pagination?.hasNext),
        nextCursor: response.pagination?.nextCursor ?? null,
      },
    };
  },

  async getQualification(leadId: string): Promise<LeadQualification> {
    const response = (await apiClient.get(ENDPOINTS.LEADS.QUALIFICATION(leadId))) as Envelope;
    return parseLeadQualification(response.data);
  },

  async getQualificationHistory(leadId: string, offset = 0) {
    const response = (await apiClient.get(`${ENDPOINTS.LEADS.QUALIFICATION(leadId)}/history`, { params: { limit: 20, offset } })) as Envelope;
    const rows = Array.isArray(response.data) ? response.data.filter(isRec) : [];
    const data: QualificationChange[] = [];
    for (const row of rows) {
      const current = parseLeadQualification({ fields: [row.current] }).fields[0];
      if (!current) continue;
      const previous = parseLeadQualification({ fields: [row.previous] }).fields[0] ?? null;
      data.push({ id: str(row._id) ?? '', previous, current, changedAt: str(row.changedAt), communicationId: str(row.communicationId), confidence: num(row.confidence) });
    }
    return { data, hasNext: Boolean(response.pagination?.hasNext), nextOffset: offset + data.length };
  },
};
