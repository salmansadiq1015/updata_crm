// The API module against the real zod schemas with server-shaped fixtures. The HTTP
// client is mocked: no request reaches any backend.
import type { z } from 'zod';

import { api } from '@/services/api/apiClient';

import { aiAgentApi } from '../api/aiAgentApi';

jest.mock('@/services/api/apiClient', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

type Responder = { data: unknown; pagination?: unknown };
const respond = (fixture: Responder) =>
  jest.fn(async (_url: string, ...rest: unknown[]) => {
    const schema = rest.find((arg) => arg && typeof (arg as z.ZodType).parse === 'function') as
      | z.ZodType
      | undefined;
    return { data: schema ? schema.parse(fixture.data) : fixture.data, pagination: fixture.pagination };
  });

beforeEach(() => jest.resetAllMocks());

describe('aiAgentApi', () => {
  it('parses the language list from GET /ai-calling/languages', async () => {
    jest.mocked(api.get).mockImplementation(
      respond({
        data: {
          languages: [
            { code: 'auto', name: 'Automatic', nativeName: 'Auto', support: 'full', rtl: false },
            { code: 'ar', name: 'Arabic', nativeName: 'العربية', support: 'full', rtl: true },
            { code: 'xx', name: 'Future', nativeName: null, support: 'beta' },
          ],
          defaultLanguage: 'en',
        },
      }) as never,
    );
    const result = await aiAgentApi.languages();
    expect(api.get).toHaveBeenCalledWith('/ai-calling/languages', expect.anything(), expect.anything());
    expect(result.defaultLanguage).toBe('en');
    expect(result.languages[1]).toEqual({
      code: 'ar',
      name: 'Arabic',
      nativeName: 'العربية',
      support: 'full',
      rtl: true,
    });
    // Unknown support level degrades safely.
    expect(result.languages[2]).toMatchObject({ code: 'xx', nativeName: '', support: 'full', rtl: false });
  });

  it('parses telephony health (no trunk) without inventing readiness', async () => {
    jest.mocked(api.get).mockImplementation(
      respond({
        data: {
          configured: false,
          livekitReady: true,
          reachable: true,
          eligible: false,
          reason: 'no_sip_trunk',
          primary: {},
        },
      }) as never,
    );
    expect(await aiAgentApi.telephonyHealth()).toEqual({
      configured: false,
      livekitReady: true,
      reason: 'no_sip_trunk',
    });
  });

  it('parses messaging health, tolerating missing provider blocks', async () => {
    jest.mocked(api.get).mockImplementation(
      respond({
        data: {
          settings: { providers: { textbeeEnabled: true } },
          providers: { textbee: { eligible: true } },
        },
      }) as never,
    );
    const health = await aiAgentApi.messagingHealth();
    expect(health.settings.providers).toEqual({ textbeeEnabled: true, twilioEnabled: false });
    expect(health.providers.twilio).toEqual({ eligible: false, reason: null });
  });

  it('lists only active SMS templates', async () => {
    jest.mocked(api.get).mockImplementation(
      respond({
        data: [
          { _id: 't1', name: 'Hello', channel: 'sms', purpose: 'support', bodyText: 'Hi {{firstName}}' },
          { _id: 't2', name: 'Old', channel: 'sms', isArchived: true },
        ],
      }) as never,
    );
    const templates = await aiAgentApi.smsTemplates();
    expect(api.get).toHaveBeenCalledWith(
      '/messaging/templates',
      expect.anything(),
      expect.objectContaining({ params: { channel: 'sms' } }),
    );
    expect(templates).toEqual([
      expect.objectContaining({ id: 't1', purpose: 'support', bodyText: 'Hi {{firstName}}' }),
    ]);
  });

  it('creates a call campaign as a draft and previews it', async () => {
    jest.mocked(api.post).mockImplementationOnce(
      respond({
        data: {
          _id: 'c1',
          name: 'AI call',
          status: 'draft',
          summary: { total: 3, eligible: 1, missingPhone: 1 },
          agentConfig: { language: 'de' },
          questionnaire: { questions: [{ fieldKey: 'need', label: 'Need' }] },
          createdAt: '2026-10-16T08:00:00Z',
        },
      }) as never,
    );
    const campaign = await aiAgentApi.createCallCampaign({} as never);
    expect(api.post).toHaveBeenCalledWith('/ai-calling/campaigns', {}, expect.anything());
    expect(campaign).toMatchObject({ id: 'c1', status: 'draft', summary: { total: 3, eligible: 1 } });

    jest.mocked(api.post).mockImplementationOnce(
      respond({
        data: {
          campaignId: 'c1',
          totalSelected: 3,
          eligible: 1,
          missingPhone: 1,
          suppressed: 0,
          ineligible: 1,
          estimatedDurationMinutes: 2,
          telephony: { configured: false, reason: 'no_sip_trunk' },
          note: 'Cost depends on usage',
        },
      }) as never,
    );
    const preview = await aiAgentApi.previewCallCampaign('c1');
    expect(api.post).toHaveBeenLastCalledWith(
      '/ai-calling/campaigns/c1/preview',
      undefined,
      expect.anything(),
    );
    expect(preview).toMatchObject({ totalSelected: 3, eligible: 1, telephony: { configured: false } });
  });

  it('parses recipients with populated leads and page pagination', async () => {
    jest.mocked(api.get).mockImplementation(
      respond({
        data: [
          {
            _id: 'r1',
            state: 'ineligible',
            leadId: { _id: 'l1', name: 'Acme AG', leadNumber: 'L-1' },
            eligibility: { eligible: false, reasons: ['consent_required'] },
          },
          { _id: 'r2', state: 'brand_new_state', leadId: 'l2' },
        ],
        pagination: { page: 1, limit: 200, total: 250, pages: 2 },
      }) as never,
    );
    const result = await aiAgentApi.callRecipients('c1');
    expect(result.total).toBe(250);
    expect(result.items[0]).toMatchObject({ id: 'r1', lead: { id: 'l1', name: 'Acme AG' } });
    // Unknown server states are kept verbatim, not coerced.
    expect(result.items[1]).toMatchObject({ state: 'brand_new_state', lead: { id: 'l2', name: null } });
  });

  it('creates SMS campaigns on the messaging module and parses rendered recipients', async () => {
    jest.mocked(api.post).mockImplementationOnce(
      respond({
        data: {
          _id: 'm1',
          name: 'AI SMS',
          channel: 'sms',
          status: 'draft',
          summary: { total: 2, eligible: 2 },
          monitoring: { progress: { eligible: 2, processed: 0, pending: 2, percent: 0 } },
        },
      }) as never,
    );
    const campaign = await aiAgentApi.createSmsCampaign({ channel: 'sms' } as never);
    expect(api.post).toHaveBeenCalledWith('/messaging/campaigns', { channel: 'sms' }, expect.anything());
    expect(campaign.monitoring.progress).toEqual({ eligible: 2, processed: 0, pending: 2, percent: 0 });

    jest.mocked(api.get).mockImplementation(
      respond({
        data: [
          {
            _id: 'mr1',
            status: 'failed',
            leadId: { _id: 'l1', name: 'Acme' },
            eligibility: { eligible: true, reasons: [] },
            rendered: { bodyText: 'Hi Acme' },
            error: { code: 'X', message: 'Carrier rejected' },
          },
        ],
        pagination: { page: 1, limit: 200, total: 1, pages: 1 },
      }) as never,
    );
    const recipients = await aiAgentApi.smsRecipients('m1');
    expect(recipients.items[0]).toMatchObject({
      status: 'failed',
      rendered: { bodyText: 'Hi Acme' },
      error: { message: 'Carrier rejected' },
    });
  });

  it('starts, pauses, resumes and cancels through the verified paths', async () => {
    const fixture = respond({ data: { _id: 'x', name: 'n', status: 'running', channel: 'sms' } });
    jest.mocked(api.post).mockImplementation(fixture as never);
    await aiAgentApi.startCallCampaign('c1');
    await aiAgentApi.pauseCallCampaign('c1');
    await aiAgentApi.resumeCallCampaign('c1');
    await aiAgentApi.cancelCallCampaign('c1');
    await aiAgentApi.startSmsCampaign('m1');
    await aiAgentApi.pauseSmsCampaign('m1');
    await aiAgentApi.resumeSmsCampaign('m1');
    await aiAgentApi.cancelSmsCampaign('m1');
    expect(jest.mocked(api.post).mock.calls.map((call) => call[0])).toEqual([
      '/ai-calling/campaigns/c1/start',
      '/ai-calling/campaigns/c1/pause',
      '/ai-calling/campaigns/c1/resume',
      '/ai-calling/campaigns/c1/cancel',
      '/messaging/campaigns/m1/start',
      '/messaging/campaigns/m1/pause',
      '/messaging/campaigns/m1/resume',
      '/messaging/campaigns/m1/cancel',
    ]);
  });

  it('parses a simulation turn', async () => {
    jest.mocked(api.post).mockImplementation(
      respond({
        data: {
          state: { disclosed: true, answers: {} },
          nextAction: {
            type: 'ask',
            question: { fieldKey: 'need', text: 'What do you need?', label: 'Need', type: 'long_text' },
          },
          progress: { total: 2, answered: 0, valid: 0, unresolvedRequired: ['need'] },
          outcomePreview: null,
        },
      }) as never,
    );
    const turn = await aiAgentApi.simulate('c1', { state: null, userText: null, disclose: true });
    expect(api.post).toHaveBeenCalledWith(
      '/ai-calling/campaigns/c1/simulate',
      { state: null, userText: null, disclose: true },
      expect.anything(),
    );
    expect(turn.nextAction).toEqual({
      type: 'ask',
      reason: null,
      question: { fieldKey: 'need', text: 'What do you need?', label: 'Need' },
    });
    expect(turn.progress).toEqual({ total: 2, answered: 0 });
  });
});
