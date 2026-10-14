import { describe, expect, it } from 'vitest';
import {
  buildCampaignListParams, campaignDeliveryRate, campaignProcessingProgress, canManageTemplate,
  filterCampaigns, outreachScrollContainerClassName,
} from '../components/outreach-center';
import type { Campaign } from '@/modules/leads/services/messaging-api';

const baseCampaign: Campaign = {
  _id: 'campaign-1', name: 'Example', channel: 'sms', status: 'completed',
  summary: {
    total: 10, eligible: 10, ineligible: 0, queued: 0, accepted: 2, sent: 2,
    delivered: 3, read: 1, failed: 1, unknown: 1, suppressed: 0,
    missingContact: 0, invalidContact: 0, duplicate: 0, optedOut: 0,
  },
};

describe('outreach analytics', () => {
  it('owns vertical scrolling inside the full-height leads workspace', () => {
    expect(outreachScrollContainerClassName.split(/\s+/)).toEqual(expect.arrayContaining([
      'h-full', 'min-h-0', 'overflow-y-auto', 'overscroll-y-contain',
    ]));
  });

  it('uses submitted evidence as the delivery-rate denominator', () => {
    // 4 proven delivered/read out of 10 submitted outcomes.
    expect(campaignDeliveryRate(baseCampaign)).toBe(0.4);
  });

  it('does not fabricate a rate when nothing has been submitted', () => {
    const campaign = structuredClone(baseCampaign);
    campaign.summary.accepted = 0;
    campaign.summary.sent = 0;
    campaign.summary.delivered = 0;
    campaign.summary.read = 0;
    campaign.summary.failed = 0;
    campaign.summary.unknown = 0;
    expect(campaignDeliveryRate(campaign)).toBe(0);
  });

  it('uses server monitoring evidence for large-campaign processing progress', () => {
    const campaign = structuredClone(baseCampaign);
    campaign.monitoring = {
      progress: { eligible: 1000, processed: 725, pending: 275, queued: 250, inFlight: 25, percent: 72.5 },
      schedule: { state: 'processing', scheduledAt: null, timezone: 'UTC', dueInSeconds: null },
      throughput: { processedPerMinute: 30, estimatedSecondsRemaining: 550 },
      largeAudience: true, refreshedAt: '2026-10-13T00:00:00.000Z',
    };
    expect(campaignProcessingProgress(campaign)).toEqual(campaign.monitoring.progress);
  });

  it('filters campaigns by explicit channel, status, and searchable metadata', () => {
    const campaigns: Campaign[] = [
      { ...structuredClone(baseCampaign), _id: 'sms', name: 'Autumn follow-up', description: 'Zurich accounts' },
      { ...structuredClone(baseCampaign), _id: 'email', name: 'Welcome series', channel: 'email', status: 'draft' },
    ];

    expect(filterCampaigns(campaigns, 'zurich', 'sms', 'completed').map((campaign) => campaign._id)).toEqual(['sms']);
    expect(filterCampaigns(campaigns, 'welcome', 'email', 'draft').map((campaign) => campaign._id)).toEqual(['email']);
    expect(filterCampaigns(campaigns, '', 'all', 'all')).toHaveLength(2);
  });

  it('sends pagination, search, and explicit filters to the campaign API', () => {
    expect(buildCampaignListParams(3, '  October nurture  ', 'email', 'running')).toEqual({
      page: 3, limit: 25, q: 'October nurture', channel: 'email', status: 'running',
    });
    expect(buildCampaignListParams(1, '', 'all', 'all')).toEqual({ page: 1, limit: 25 });
  });

  it('offers owner-only template controls while keeping shared templates duplicable', () => {
    expect(canManageTemplate({ createdBy: 'user-1' }, 'user-1')).toBe(true);
    expect(canManageTemplate({ createdBy: { _id: 'user-1' } }, 'user-1')).toBe(true);
    expect(canManageTemplate({ createdBy: 'user-2' }, 'user-1')).toBe(false);
    expect(canManageTemplate({}, 'user-1')).toBe(false);
  });
});
