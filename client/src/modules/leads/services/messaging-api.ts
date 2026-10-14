import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export type OutreachChannel = 'email' | 'sms' | 'whatsapp';
export type OutreachPurpose = 'transactional' | 'promotional' | 'support';

export type MessageTemplate = {
  _id: string;
  name: string;
  channel: OutreachChannel;
  purpose: OutreachPurpose;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  category?: string;
  description?: string;
  requiredVariables?: string[];
  fallbackValues?: Record<string, string>;
  isShared?: boolean;
  isArchived?: boolean;
  createdBy?: string | { _id?: string };
  whatsapp?: {
    metaName?: string | null;
    language?: string | null;
    approvalStatus?: string | null;
    components?: Array<Record<string, unknown>>;
    providerDefinition?: Array<Record<string, unknown>> | null;
    twilioContentSid?: string | null;
  };
};

export type Campaign = {
  _id: string;
  name: string;
  channel: OutreachChannel;
  status: string;
  scheduledAt?: string | null;
  createdAt?: string;
  description?: string;
  purpose?: OutreachPurpose;
  isTest?: boolean;
  summary: {
    total: number;
    eligible: number;
    ineligible: number;
    draft?: number;
    queued: number;
    submitting?: number;
    accepted: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    undelivered?: number;
    unknown: number;
    cancelled?: number;
    suppressed: number;
    missingContact: number;
    invalidContact: number;
    duplicate: number;
    optedOut: number;
  };
  monitoring?: {
    progress: { eligible: number; processed: number; pending: number; queued: number; inFlight: number; percent: number };
    schedule: { state: string; scheduledAt: string | null; timezone: string; dueInSeconds: number | null };
    throughput: { processedPerMinute: number | null; estimatedSecondsRemaining: number | null };
    largeAudience: boolean;
    refreshedAt: string;
  };
};

export type RetryEligibility = {
  status: 'all' | 'failed' | 'undelivered';
  candidates: number;
  retryable: number;
  blocked: { ambiguous: number; permanent: number };
  generatedAt: string;
};

export type BulkRetryResult = {
  campaign: Campaign;
  operationId: string;
  queued: number;
  blocked: { ambiguous: number; permanent: number };
};

export type BulkConsentVerificationResult = {
  campaign: Campaign;
  verified: number;
};

export type MessageHistoryEntry = {
  _id: string;
  channel: OutreachChannel;
  status: string;
  provider?: string | null;
  providerMessageId?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  error?: { code?: string | null; message?: string | null };
  rendered?: { subject?: string; bodyText?: string };
  campaignId?: { _id?: string; name?: string } | string;
  direction?: 'inbound' | 'outbound';
};

export type ConsentStatus = 'granted' | 'denied' | 'revoked' | 'unknown';
export type EffectiveConsentStatus = ConsentStatus | 'suppressed' | 'expired';
export type LeadConsentChannel = {
  channel: OutreachChannel;
  status: ConsentStatus;
  effectiveStatus: EffectiveConsentStatus;
  hasDestination: boolean;
  evidence: string;
  source?: string | null;
  capturedAt?: string | null;
  expiresAt?: string | null;
  changedAt?: string | null;
  suppression?: { active: true; reason: string; source?: string | null; suppressedAt: string } | null;
};
export type LeadConsentProfile = { leadId: string; channels: LeadConsentChannel[] };
export type UpdateLeadConsentInput = {
  channel: OutreachChannel;
  status: ConsentStatus;
  evidence?: string;
  source?: string;
  capturedAt?: string;
  expiresAt?: string | null;
};

export type CampaignRecipient = MessageHistoryEntry & {
  leadId?: { _id?: string; leadNumber?: string; name?: string; email?: string; phone?: string; mobile?: string } | string;
  destination?: string;
  eligibility?: { eligible: boolean; reasons: string[] };
  fallbackFrom?: string | null;
  fallbackReason?: string | null;
  latestAttempt?: { outcome: string; failureClass?: string | null; attemptNumber: number } | null;
};

export type MessagingAnalytics = {
  campaigns: number;
  activeCampaigns: number;
  totalRecipients: number;
  submitted: number;
  delivered: number;
  read: number;
  emailBounced: number;
  fallbackCount: number;
  inboundReplies: number;
  deliveryRate: number;
  readRate: number;
  emailBounceRate: number;
  byStatus: Array<{ _id: string; count: number }>;
  byChannel: Array<{ _id: string; count: number; submitted: number; delivered: number; read: number; failed: number; bounced: number }>;
  byProvider: Array<{
    _id: string; count: number; submitted: number; delivered: number; read: number; failed: number;
    costs: Array<{ currency: string; actual: number; estimated: number }>;
  }>;
  quotas: { daily: number; monthly: number; perCampaign: number };
  usage: { daily: number; monthly: number };
  compliance: { frequencyBlocked: number; expiringConsents: number; expiredConsents: number; suppressedDestinations: number };
  queue?: { waiting: number; active: number; failed: number; delayed: number } | null;
};

export type ProviderHealth = {
  settings: {
    providers: Record<string, boolean>;
    smsFallback: { enabled: boolean; allowedCountries: string[]; allowedPurposes: OutreachPurpose[]; dailySpendLimit: number; monthlySpendLimit: number };
    whatsappFallback: { enabled: boolean; allowedCountries: string[]; allowedPurposes: OutreachPurpose[]; dailySpendLimit: number; monthlySpendLimit: number };
    countryRouting: { textbeeAllowedCountries: string[]; twilioAllowedCountries: string[]; whatsappAllowedCountries: string[]; twilioWhatsappAllowedCountries: string[] };
    quotas: { daily: number; monthly: number; perCampaign: number };
    quietHours: { enabled: boolean; start: string; end: string; timezone: string };
    frequencyLimits: {
      enabled: boolean;
      purposes: OutreachPurpose[];
      email: { minIntervalHours: number; dailyMax: number; weeklyMax: number };
      sms: { minIntervalHours: number; dailyMax: number; weeklyMax: number };
      whatsapp: { minIntervalHours: number; dailyMax: number; weeklyMax: number };
    };
    regionalQuietHours: Array<{
      _id?: string;
      name: string;
      enabled: boolean;
      countries: string[];
      channel: OutreachChannel;
      purpose: OutreachPurpose;
      start: string;
      end: string;
      timezone: string;
    }>;
    pricing: { currency: string; textbeeCarrierPerSegment: number; twilioDefaultPerSegment: number; twilioWhatsappDefaultPerMessage: number; metaMarketingPerMessage: number; metaUtilityPerMessage: number; metaServicePerMessage: number };
  };
  providers: Record<string, { configured: boolean; reachable: boolean; eligible: boolean; reason?: string | null; device?: Record<string, unknown> }>;
  operations?: {
    checkedAt: string;
    snapshots: Record<string, { status: 'healthy' | 'degraded' | 'down'; checkedAt: string; previousStatus: string }>;
    unknown: { count: number; oldestAt?: string | null };
    pendingReconciliation: number;
    recentErrors: Array<{ _id: { provider: string; outcome: 'rejected' | 'ambiguous' }; count: number; lastAt: string }>;
    queue?: { waiting: number; active: number; completed?: number; failed: number; delayed: number } | null;
    readiness: {
      ready: boolean;
      counts: { pass: number; warn: number; fail: number };
      checks: Array<{ id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
    };
  };
};

export type Paginated<T> = { data: T[]; pagination: { page: number; limit: number; total: number; pages: number } };

export type CreateCampaignInput = {
  name: string;
  description?: string;
  channel: OutreachChannel;
  purpose: OutreachPurpose;
  templateId?: string | null;
  content: {
    subject?: string;
    bodyHtml?: string;
    bodyText: string;
    fallbackValues?: Record<string, string>;
    whatsappTemplateName?: string | null;
    whatsappLanguage?: string | null;
    whatsappComponents?: Array<Record<string, unknown>>;
    whatsappTwilioContentSid?: string | null;
  };
  selection: { mode: 'explicit'; leadIds: string[] } | { mode: 'filters'; filters: Record<string, unknown> };
  routing?: { smsProvider: 'auto' | 'textbee' | 'twilio'; allowFallback: boolean };
  scheduledAt?: string | null;
  timezone?: string;
};

export const messagingApi = {
  async listTemplates(channel?: OutreachChannel): Promise<MessageTemplate[]> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.TEMPLATES, { params: channel ? { channel } : {} });
    const payload = response as unknown as { data?: MessageTemplate[] } | MessageTemplate[];
    return Array.isArray(payload) ? payload : payload.data ?? [];
  },
  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.CAMPAIGNS, input);
    return ((response as unknown as { data?: Campaign }).data ?? response) as Campaign;
  },
  async listCampaigns(params: Record<string, unknown> = {}): Promise<Paginated<Campaign>> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.CAMPAIGNS, { params });
    const payload = response as unknown as { data?: Campaign[]; pagination?: Paginated<Campaign>['pagination'] };
    return { data: payload.data ?? [], pagination: payload.pagination ?? { page: 1, limit: 25, total: 0, pages: 0 } };
  },
  async getCampaign(id: string): Promise<Campaign> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.CAMPAIGN(id));
    return ((response as unknown as { data?: Campaign }).data ?? response) as Campaign;
  },
  async startCampaign(id: string, scheduledAt?: string | null): Promise<Campaign> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.START(id), { scheduledAt: scheduledAt || null });
    return ((response as unknown as { data?: Campaign }).data ?? response) as Campaign;
  },
  async listRecipients(id: string, params: Record<string, unknown> = {}): Promise<Paginated<CampaignRecipient>> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.RECIPIENTS(id), { params: { limit: 100, ...params } });
    const payload = response as unknown as { data?: CampaignRecipient[]; pagination?: Paginated<CampaignRecipient>['pagination'] };
    return { data: payload.data ?? [], pagination: payload.pagination ?? { page: 1, limit: 100, total: 0, pages: 0 } };
  },
  async removeDraftRecipient(id: string, recipientId: string): Promise<Campaign> {
    const response = await apiClient.delete(ENDPOINTS.MESSAGING.RECIPIENT(id, recipientId));
    return ((response as unknown as { data?: Campaign }).data ?? response) as Campaign;
  },
  async verifyCampaignConsent(id: string, input: {
    recipientIds: string[];
    evidence: string;
    source: string;
    capturedAt: string;
    expiresAt?: string | null;
    confirmation: true;
  }): Promise<BulkConsentVerificationResult> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.VERIFY_CAMPAIGN_CONSENT(id), input);
    return ((response as unknown as { data?: BulkConsentVerificationResult }).data ?? response) as BulkConsentVerificationResult;
  },
  async leadHistoryPage(leadId: string, params: Record<string, unknown> = {}): Promise<Paginated<MessageHistoryEntry>> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.LEAD_HISTORY(leadId), { params: { limit: 25, ...params } });
    const payload = response as unknown as { data?: MessageHistoryEntry[]; pagination?: Paginated<MessageHistoryEntry>['pagination'] };
    return { data: payload.data ?? [], pagination: payload.pagination ?? { page: 1, limit: 25, total: 0, pages: 0 } };
  },
  async leadHistory(leadId: string): Promise<MessageHistoryEntry[]> {
    return (await this.leadHistoryPage(leadId, { limit: 50 })).data;
  },
  async getLeadConsent(leadId: string): Promise<LeadConsentProfile> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.LEAD_CONSENT(leadId));
    return ((response as unknown as { data?: LeadConsentProfile }).data ?? response) as LeadConsentProfile;
  },
  async updateLeadConsent(leadId: string, input: UpdateLeadConsentInput): Promise<LeadConsentChannel> {
    const response = await apiClient.put(ENDPOINTS.MESSAGING.LEAD_CONSENT(leadId), input);
    return ((response as unknown as { data?: LeadConsentChannel }).data ?? response) as LeadConsentChannel;
  },
  async reinstateLeadConsent(leadId: string, input: {
    channel: OutreachChannel; evidence: string; source?: string; capturedAt: string;
    expiresAt?: string | null; confirmation: true;
  }): Promise<LeadConsentChannel> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.REINSTATE_LEAD_CONSENT(leadId), input);
    return ((response as unknown as { data?: LeadConsentChannel }).data ?? response) as LeadConsentChannel;
  },
  async pauseCampaign(id: string): Promise<Campaign> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.PAUSE(id));
    return ((response as unknown as { data?: Campaign }).data ?? response) as Campaign;
  },
  async resumeCampaign(id: string): Promise<Campaign> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.RESUME(id), {});
    return ((response as unknown as { data?: Campaign }).data ?? response) as Campaign;
  },
  async cancelCampaign(id: string): Promise<Campaign> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.CANCEL(id));
    return ((response as unknown as { data?: Campaign }).data ?? response) as Campaign;
  },
  async retryRecipients(id: string, recipientIds: string[]): Promise<Campaign> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.RETRY(id), { recipientIds });
    return ((response as unknown as { data?: Campaign }).data ?? response) as Campaign;
  },
  async retryEligibility(id: string, status?: 'failed' | 'undelivered'): Promise<RetryEligibility> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.RETRY_ELIGIBILITY(id), { params: status ? { status } : {} });
    return ((response as unknown as { data?: RetryEligibility }).data ?? response) as RetryEligibility;
  },
  async retryEligibleRecipients(id: string, input: { expectedCount: number; confirmation: true; status?: 'failed' | 'undelivered' }): Promise<BulkRetryResult> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.RETRY_ELIGIBLE(id), input);
    return ((response as unknown as { data?: BulkRetryResult }).data ?? response) as BulkRetryResult;
  },
  async reconcileRecipient(id: string, recipientId: string, input: { decision: 'confirm_not_accepted' | 'confirm_accepted'; providerMessageId?: string; note: string }): Promise<CampaignRecipient> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.RECONCILE(id, recipientId), input);
    return ((response as unknown as { data?: CampaignRecipient }).data ?? response) as CampaignRecipient;
  },
  async exportCampaign(id: string): Promise<Blob> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.EXPORT(id), { responseType: 'blob' });
    return (response as unknown as { data: Blob }).data;
  },
  async analytics(params: Record<string, unknown> = {}): Promise<MessagingAnalytics> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.ANALYTICS, { params });
    return ((response as unknown as { data?: MessagingAnalytics }).data ?? response) as MessagingAnalytics;
  },
  async exportAnalytics(params: Record<string, unknown> = {}): Promise<Blob> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.ANALYTICS_EXPORT, { params, responseType: 'blob' });
    return (response as unknown as { data: Blob }).data;
  },
  async createTemplate(input: Omit<MessageTemplate, '_id'>): Promise<MessageTemplate> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.TEMPLATES, input);
    return ((response as unknown as { data?: MessageTemplate }).data ?? response) as MessageTemplate;
  },
  async updateTemplate(id: string, input: Partial<Omit<MessageTemplate, '_id'>>): Promise<MessageTemplate> {
    const response = await apiClient.patch(`${ENDPOINTS.MESSAGING.TEMPLATES}/${id}`, input);
    return ((response as unknown as { data?: MessageTemplate }).data ?? response) as MessageTemplate;
  },
  async duplicateTemplate(id: string): Promise<MessageTemplate> {
    const response = await apiClient.post(`${ENDPOINTS.MESSAGING.TEMPLATES}/${id}/duplicate`);
    return ((response as unknown as { data?: MessageTemplate }).data ?? response) as MessageTemplate;
  },
  async archiveTemplate(id: string): Promise<MessageTemplate> {
    const response = await apiClient.post(`${ENDPOINTS.MESSAGING.TEMPLATES}/${id}/archive`);
    return ((response as unknown as { data?: MessageTemplate }).data ?? response) as MessageTemplate;
  },
  async syncMetaTemplates(): Promise<{ synced: number; templates: MessageTemplate[] }> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.SYNC_META_TEMPLATES);
    return ((response as unknown as { data?: { synced: number; templates: MessageTemplate[] } }).data ?? response) as { synced: number; templates: MessageTemplate[] };
  },
  async providerHealth(): Promise<ProviderHealth> {
    const response = await apiClient.get(ENDPOINTS.MESSAGING.HEALTH);
    return ((response as unknown as { data?: ProviderHealth }).data ?? response) as ProviderHealth;
  },
  async updateSettings(input: Partial<ProviderHealth['settings']>): Promise<ProviderHealth['settings']> {
    const response = await apiClient.patch(ENDPOINTS.MESSAGING.SETTINGS, input);
    return ((response as unknown as { data?: ProviderHealth['settings'] }).data ?? response) as ProviderHealth['settings'];
  },
  async testSend(input: {
    authorizedRecipient: true; leadId: string; channel: OutreachChannel; purpose: OutreachPurpose;
    templateId?: string | null; content: CreateCampaignInput['content']; routing?: CreateCampaignInput['routing'];
  }): Promise<Campaign> {
    const response = await apiClient.post(ENDPOINTS.MESSAGING.TEST_SEND, input);
    return ((response as unknown as { data?: Campaign }).data ?? response) as Campaign;
  },
};
