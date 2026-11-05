// The API module against the real zod schemas with server-shaped payloads (HTTP client mocked).
import type { z } from 'zod';

import { api } from '@/services/api/apiClient';
import type { CursorPagination } from '@/services/api/apiTypes';

import { incomingCallsApi } from '../api/incomingCallsApi';
import { inboundCallDetailSchema } from '../types';

import {
  CALL_ID,
  LEAD_ID,
  serverDetail,
  serverLive,
  serverRow,
  serverSettings,
} from '../__fixtures__/serverPayloads';

jest.mock('@/services/api/apiClient', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn() },
}));

const respond = (data: unknown, pagination?: unknown) =>
  jest.fn(async (_url: string, ...rest: unknown[]) => {
    const schema = rest.find((arg) => arg && typeof (arg as z.ZodType).parse === 'function') as
      | z.ZodType
      | undefined;
    // /inbound-calls pages by number; the client's envelope type only models cursor pagination.
    return {
      data: schema ? schema.parse(data) : data,
      pagination: pagination as CursorPagination | undefined,
    };
  });

beforeEach(() => jest.resetAllMocks());

describe('GET /inbound-calls/:id', () => {
  it('parses a realistic call detail payload', async () => {
    jest.mocked(api.get).mockImplementation(respond(serverDetail()));
    const call = await incomingCallsApi.get(CALL_ID);
    expect(jest.mocked(api.get).mock.calls[0]?.[0]).toBe(`/inbound-calls/${CALL_ID}`);
    expect(call).toMatchObject({
      id: CALL_ID,
      status: 'COMPLETED',
      aiStatus: 'ended',
      callerType: 'new',
      lead: { id: LEAD_ID, created: true },
      leadDetail: { id: LEAD_ID, email: null, city: null },
      sim: { slot: 0, label: null },
      qualificationDetail: { result: 'PARTIALLY_QUALIFIED', score: 67, missing: ['requirements'] },
      summary: { tone: null, unresolvedQuestions: ['Exact price'] },
      callback: { requested: true, whenText: 'tomorrow morning' },
    });
    // Numeric field values are kept as text; explicit vs inferred survives.
    expect(call.fields.map((f) => [f.key, f.value, f.explicit, f.superseded])).toEqual([
      ['full_name', 'Amina Benali', true, false],
      ['budget', '5000', false, false],
      ['company', 'Old value', true, true],
    ]);
    expect(call.qa.callerQuestions[0]).toMatchObject({
      category: 'PRICING_INQUIRY',
      answerStatus: 'partially_answered',
    });
    expect(call.recommendations.map((r) => [r.id, r.status])).toEqual([
      ['ARRANGE_CALLBACK', 'pending'],
      ['SEND_PRICING', 'executed'],
    ]);
    expect(call.transcript).toHaveLength(2);
    expect(call.work).toMatchObject({
      status: 'in_progress',
      updatedBy: { name: 'Sara Owner' },
      assignee: null,
    });
    expect(call.work.history.map((h) => [h.from, h.to, h.source])).toEqual([
      [null, 'new', 'agent'],
      ['new', 'in_progress', 'user'],
    ]);
    expect(call.cost).toMatchObject({
      amount: 0.042,
      currency: 'USD',
      model: 'gpt-realtime',
      tokens: { total: 12400 },
    });
  });

  it('tolerates a call with nulls and missing sections (ringing, private number)', () => {
    const parsed = inboundCallDetailSchema.parse({
      ...serverRow({ status: 'RINGING', aiStatus: 'waiting', lead: null, agent: null, device: null }),
      caller: { name: null, number: null, presentation: 'private' },
      callerType: 'private',
      leadDetail: null,
      match: { status: 'unknown', candidates: [] },
      summary: null,
      qualificationDetail: null,
      handoff: null,
      callback: null,
      language: null,
      intentsDetail: null,
      error: { code: null, message: null },
    });
    expect(parsed.caller.presentation).toBe('private');
    expect(parsed.fields).toEqual([]);
    expect(parsed.qa).toEqual({
      callerQuestions: [],
      unanswered: [],
      missingInformation: [],
      closingQuestions: [],
    });
    expect(parsed).not.toHaveProperty('recording');
  });
});

describe('incomingCallsApi', () => {
  it('lists calls with the filter chip and page numbers', async () => {
    jest
      .mocked(api.get)
      .mockImplementation(respond([serverRow()], { page: 1, limit: 25, total: 30, pages: 2 }));
    const page = await incomingCallsApi.list('missed');
    expect(page).toMatchObject({ page: 1, pages: 2, total: 30 });
    expect(page.items[0]?.caller.name).toBe('Amina Benali');
    expect(jest.mocked(api.get).mock.calls[0]?.[2]).toMatchObject({
      params: { status: 'MISSED', page: 1, limit: 25 },
    });
  });

  it('parses live calls with agent activity and the transcript tail', async () => {
    jest.mocked(api.get).mockImplementation(respond([serverLive()]));
    const [call] = await incomingCallsApi.live();
    expect(call?.agentActivity?.speaker).toBe('assistant');
    expect(call?.lastTurns[1]?.role).toBe('caller');
    expect(call?.collected).toEqual([
      { key: 'full_name', value: 'Amina Benali', explicit: true },
      { key: 'budget', value: '5000', explicit: false },
    ]);
  });

  it('sends the master switch with the version it read, and controls to the right path', async () => {
    jest.mocked(api.patch).mockImplementation(respond(serverSettings({ enabled: true, version: 4 })));
    jest.mocked(api.post).mockImplementation(respond({ ok: true }));
    const saved = await incomingCallsApi.setEnabled(true, 3);
    expect(saved).toMatchObject({ enabled: true, version: 4 });
    expect(jest.mocked(api.patch).mock.calls[0]?.slice(0, 2)).toEqual([
      '/inbound-calls/settings',
      { enabled: true, version: 3 },
    ]);
    await incomingCallsApi.control(CALL_ID, 'takeover');
    expect(jest.mocked(api.post).mock.calls[0]?.[0]).toBe(`/inbound-calls/${CALL_ID}/control/takeover`);
  });

  it('"New leads" asks for calls that created a lead', async () => {
    jest.mocked(api.get).mockImplementation(respond([], { page: 1, limit: 25, total: 0, pages: 0 }));
    await incomingCallsApi.list('newLeads');
    expect(jest.mocked(api.get).mock.calls[0]?.[2]).toMatchObject({ params: { leadCreated: 'true' } });
  });

  it('reports SIM cards to a paired device', async () => {
    const sims = [{ slot: 0, label: 'Work', carrier: 'Swisscom' }];
    jest.mocked(api.put).mockImplementation(respond({ sims, removedSimAgents: 0 }));
    const out = await incomingCallsApi.reportSims('d1', sims);
    expect(out.sims).toEqual(sims);
    expect(jest.mocked(api.put).mock.calls[0]?.slice(0, 2)).toEqual([
      '/inbound-calls/devices/d1/sims',
      { sims },
    ]);
  });

  it('work status, assignee and lead choice reach the right endpoints', async () => {
    jest.mocked(api.patch).mockImplementation(respond(serverDetail()));
    jest.mocked(api.post).mockImplementation(respond({ followUpId: 'f1', call: serverDetail() }));
    await incomingCallsApi.updateWork(CALL_ID, { status: 'resolved', note: 'Done' });
    await incomingCallsApi.updateWork(CALL_ID, { assignedTo: null });
    expect(jest.mocked(api.patch).mock.calls.map((c) => c.slice(0, 2))).toEqual([
      [`/inbound-calls/${CALL_ID}/work`, { status: 'resolved', note: 'Done' }],
      [`/inbound-calls/${CALL_ID}/work`, { assignedTo: null }],
    ]);
    const out = await incomingCallsApi.scheduleFollowUp(CALL_ID, {
      dueAt: '2026-11-05T09:00:00.000Z',
      lead: { createLead: true },
    });
    expect(out.followUpId).toBe('f1');
    expect(out.call?.work.status).toBe('in_progress');
    expect(jest.mocked(api.post).mock.calls[0]?.[1]).toEqual({
      dueAt: '2026-11-05T09:00:00.000Z',
      note: null,
      createLead: true,
    });
    jest.mocked(api.post).mockImplementation(respond(serverDetail()));
    await incomingCallsApi.decideRecommendation(CALL_ID, 'ARRANGE_CALLBACK', 'execute', { leadId: LEAD_ID });
    await incomingCallsApi.decideRecommendation(CALL_ID, 'SEND_PRICING', 'dismiss', { leadId: LEAD_ID });
    expect(
      jest
        .mocked(api.post)
        .mock.calls.slice(1)
        .map((c) => c[1]),
    ).toEqual([{ decision: 'execute', leadId: LEAD_ID }, { decision: 'dismiss' }]);
  });

  it('list chips: Open and Mine', async () => {
    jest.mocked(api.get).mockImplementation(respond([], { page: 1, limit: 25, total: 0, pages: 0 }));
    await incomingCallsApi.list('open');
    await incomingCallsApi.list('mine');
    expect(jest.mocked(api.get).mock.calls.map((c) => (c[2] as { params: object }).params)).toEqual([
      expect.objectContaining({ workStatus: 'open' }),
      expect.objectContaining({ assignedTo: 'me' }),
    ]);
  });
});
