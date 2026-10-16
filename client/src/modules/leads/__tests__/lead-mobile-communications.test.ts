import { describe, expect, it } from 'vitest';
import { parseLeadCommunication, parseLeadQualification } from '../services/lead-communication-api';
import { formatDuration, observedText } from '../ui/lead-mobile-communications';

const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) =>
  String(fallback ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? ''));

const serverRow = {
  id: 'c1',
  operationId: '0b8f3a52-3c55-4c3e-9b0e-6f7c4b8b1a11',
  leadId: 'l1',
  channel: 'phone',
  route: 'dialer_handoff',
  mode: 'manual',
  state: 'completed',
  destinationField: 'mobile',
  destinationMasked: '•••• 4321',
  observed: {
    ringingObserved: false, offhookAt: '2026-10-16T09:00:02.000Z', idleAfterOffhookAt: '2026-10-16T09:02:12.000Z', offhookDurationSec: 130, evidence: 'telephony_events',
  },
  outcome: {
    disposition: 'interested', connected: 'yes', notes: 'Wants a quote', followUpAt: null, followUpTimezone: null, statusChange: null, doNotContact: false,
  },
  sms: null,
  receipt: { steps: { outcome: { status: 'ok', error: null, at: '2026-10-16T09:03:00.000Z' }, contactLog: { status: 'failed', error: 'x', at: null } }, completedAt: null },
  createdBy: { id: 'u1', firstName: 'Field', lastName: 'Agent', email: 'f@a.ch' },
  createdAt: '2026-10-16T09:00:00.000Z',
};

describe('lead communication parsing', () => {
  it('parses a server row, including populated createdBy and receipt steps', () => {
    const comm = parseLeadCommunication(serverRow);
    expect(comm).toMatchObject({
      id: 'c1', channel: 'phone', destinationMasked: '•••• 4321', createdByName: 'Field Agent',
      outcome: { disposition: 'interested', connected: 'yes' },
    });
    expect(comm?.receipt.steps.contactLog?.status).toBe('failed');
  });

  it('drops rows without a known channel', () => {
    expect(parseLeadCommunication({ ...serverRow, channel: 'fax' })).toBeNull();
    expect(parseLeadCommunication(null)).toBeNull();
  });

  it('parses qualification schema + fields tolerantly', () => {
    const q = parseLeadQualification({
      schema: [{ fieldKey: 'interest', label: 'Interest level', type: 'single_choice', options: ['high', 'low'], helpText: null }],
      fields: [{ fieldKey: 'interest', label: 'Interest', value: 'high', status: 'answered', source: 'user', evidence: null, updatedAt: '2026-10-16T09:00:00.000Z' }, { fieldKey: 'budget', value: { bad: true }, status: 'weird' }],
    });
    expect(q.schema[0].options).toEqual(['high', 'low']);
    expect(q.fields[1]).toMatchObject({ value: null, status: 'unknown' });
  });
});

describe('observed evidence text never claims an answered call', () => {
  it('describes off-hook duration as dialing + talk', () => {
    const comm = parseLeadCommunication(serverRow)!;
    expect(observedText(comm, t)).toBe('Off-hook observed 2m 10s (dialing + talk, not proof of answer)');
  });

  it('reports missing evidence and ignores SMS', () => {
    const none = parseLeadCommunication({ ...serverRow, observed: { evidence: 'none' } })!;
    expect(observedText(none, t)).toMatch(/No call-state events/);
    const sms = parseLeadCommunication({ ...serverRow, channel: 'sms' })!;
    expect(observedText(sms, t)).toBeNull();
    expect(formatDuration(45)).toBe('45s');
  });
});
