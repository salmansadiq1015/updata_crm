import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClient = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ default: apiClient }));

import { messagingApi } from '@/modules/leads/services/messaging-api';

describe('messaging API client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls safe campaign operations through their dedicated endpoints', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c1', status: 'paused' } });

    await messagingApi.pauseCampaign('c1');
    await messagingApi.resumeCampaign('c1');
    await messagingApi.retryRecipients('c1', ['r1']);
    await messagingApi.reconcileRecipient('c1', 'r1', {
      decision: 'confirm_not_accepted', note: 'Provider support confirmed no acceptance.',
    });

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/messaging/campaigns/c1/pause');
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/messaging/campaigns/c1/resume', {});
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/messaging/campaigns/c1/retry', { recipientIds: ['r1'] });
    expect(apiClient.post).toHaveBeenNthCalledWith(4, '/messaging/campaigns/c1/recipients/r1/reconcile', {
      decision: 'confirm_not_accepted', note: 'Provider support confirmed no acceptance.',
    });
  });

  it('previews and confirms an exact server-scoped bulk retry', async () => {
    apiClient.get.mockResolvedValue({ data: {
      status: 'failed', candidates: 8, retryable: 5,
      blocked: { ambiguous: 2, permanent: 1 }, generatedAt: '2026-10-13T00:00:00.000Z',
    } });
    apiClient.post.mockResolvedValue({ data: { campaign: { _id: 'c1' }, operationId: 'op1', queued: 5, blocked: { ambiguous: 2, permanent: 1 } } });

    await messagingApi.retryEligibility('c1', 'failed');
    await messagingApi.retryEligibleRecipients('c1', { expectedCount: 5, confirmation: true, status: 'failed' });

    expect(apiClient.get).toHaveBeenCalledWith('/messaging/campaigns/c1/retry-eligibility', { params: { status: 'failed' } });
    expect(apiClient.post).toHaveBeenCalledWith('/messaging/campaigns/c1/retry-eligible', {
      expectedCount: 5, confirmation: true, status: 'failed',
    });
  });

  it('requires an explicit authorized-recipient flag in test-send payloads', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'test-1', status: 'queued' } });
    await messagingApi.testSend({
      authorizedRecipient: true, leadId: 'lead-1', channel: 'sms', purpose: 'support',
      content: { bodyText: 'Test' }, routing: { smsProvider: 'textbee', allowFallback: false },
    });

    expect(apiClient.post).toHaveBeenCalledWith('/messaging/test-send', expect.objectContaining({
      authorizedRecipient: true, leadId: 'lead-1', channel: 'sms',
    }));
  });

  it('removes a recipient only through the scoped draft endpoint', async () => {
    apiClient.delete.mockResolvedValue({ data: { _id: 'c1', status: 'draft' } });

    await messagingApi.removeDraftRecipient('c1', 'r1');

    expect(apiClient.delete).toHaveBeenCalledWith('/messaging/campaigns/c1/recipients/r1');
  });

  it('normalizes paginated campaign and recipient responses', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: [{ _id: 'c1' }], pagination: { page: 1, limit: 25, total: 1, pages: 1 } })
      .mockResolvedValueOnce({ data: [{ _id: 'r1' }], pagination: { page: 1, limit: 100, total: 1, pages: 1 } });

    const campaigns = await messagingApi.listCampaigns({ status: 'running' });
    const recipients = await messagingApi.listRecipients('c1');

    expect(campaigns.pagination.total).toBe(1);
    expect(recipients.data[0]._id).toBe('r1');
    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/messaging/campaigns', { params: { status: 'running' } });
  });

  it('synchronizes Meta templates only through the server endpoint', async () => {
    apiClient.post.mockResolvedValue({ data: { synced: 2, templates: [] } });
    await expect(messagingApi.syncMetaTemplates()).resolves.toMatchObject({ synced: 2 });
    expect(apiClient.post).toHaveBeenCalledWith('/messaging/templates/sync-meta');
  });

  it('exports analytics with the exact active date filters', async () => {
    const blob = new Blob(['section,metric']);
    apiClient.get.mockResolvedValue({ data: blob });

    await expect(messagingApi.exportAnalytics({ from: '2026-09-01T00:00:00.000Z' })).resolves.toBe(blob);
    expect(apiClient.get).toHaveBeenCalledWith('/messaging/analytics/export', {
      params: { from: '2026-09-01T00:00:00.000Z' }, responseType: 'blob',
    });
  });

  it('loads, updates, and explicitly reinstates lead consent through scoped endpoints', async () => {
    apiClient.get.mockResolvedValue({ data: { leadId: 'lead-1', channels: [] } });
    apiClient.put.mockResolvedValue({ data: { channel: 'email', status: 'granted' } });
    apiClient.post.mockResolvedValue({ data: { channel: 'email', status: 'granted' } });

    await messagingApi.getLeadConsent('lead-1');
    await messagingApi.updateLeadConsent('lead-1', {
      channel: 'email', status: 'granted', evidence: 'Signed form', capturedAt: '2026-10-13T10:00:00.000Z',
    });
    await messagingApi.reinstateLeadConsent('lead-1', {
      channel: 'email', evidence: 'Signed renewed form', capturedAt: '2026-10-13T10:00:00.000Z', confirmation: true,
    });

    expect(apiClient.get).toHaveBeenCalledWith('/messaging/leads/lead-1/consent');
    expect(apiClient.put).toHaveBeenCalledWith('/messaging/leads/lead-1/consent', expect.objectContaining({ status: 'granted' }));
    expect(apiClient.post).toHaveBeenCalledWith('/messaging/leads/lead-1/consent/reinstate', expect.objectContaining({ confirmation: true }));
  });
});
