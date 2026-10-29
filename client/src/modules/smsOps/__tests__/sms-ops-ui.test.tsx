// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { smsOpsTranslations } from '@/lib/i18n/sms-ops-translations';
import type { AnswerReview, ContactPolicySettings, RecoveryItem, SmsDevice } from '../types/sms-ops-types';

// The real translations, so the Arabic (RTL) rendering is exercised end to end.
const lang = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => {
    const dict = (smsOpsTranslations as Record<string, Record<string, string>>)[lang.locale];
    const t = (key: string, fallback?: string, vars?: Record<string, unknown>) => {
      const raw = dict[key] ?? fallback ?? key;
      return raw.replace(/\{(\w+)\}/g, (_m: string, k: string) => (vars?.[k] != null ? String(vars[k]) : `{${k}}`));
    };
    return { t, locale: lang.locale, dir: lang.locale === 'ar' ? 'rtl' : 'ltr', isRTL: lang.locale === 'ar' };
  },
  LanguageProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/socket/client', () => ({ getSocket: () => null }));
vi.mock('@/modules/leads/services/lead-api', () => ({
  leadApi: { listLeads: vi.fn(async () => ({ data: [{ id: 'l9', name: 'Bäckerei Nord', leadNumber: 'L-9' }], pagination: {} })) },
}));
const api = vi.hoisted(() => ({
  devices: vi.fn(), device: vi.fn(), resync: vi.fn(),
  reviews: vi.fn(), reviewCounts: vi.fn(), resolveReview: vi.fn(),
  recovery: vi.fn(), recoveryCounts: vi.fn(), recoveryAction: vi.fn(), bulkDismiss: vi.fn(),
  callbacks: vi.fn(), policy: vi.fn(), savePolicy: vi.fn(), leadStatus: vi.fn(), leadCheck: vi.fn(), campaignSkips: vi.fn(),
}));
vi.mock('../services/sms-ops-api', () => ({ smsOpsApi: api }));

const { SmsOpsWorkspace } = await import('../ui/sms-ops-workspace');
const { RecoveryInbox } = await import('../ui/recovery-inbox');
const { ReviewCard, buildDecisions } = await import('../ui/answer-review-queue');
const { ContactPolicySettingsForm, policyPayload } = await import('../ui/contact-policy-settings');
const { ContactLimitSkips } = await import('../ui/contact-limit-skips');
const { LeadContactPolicy } = await import('../ui/lead-contact-policy');
const { visibleActions } = await import('../sms-ops-domain');

const page = <T,>(data: T[]) => ({ data, pagination: { page: 1, limit: 25, total: data.length, pages: 1 } });
function wrap(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

const device: SmsDevice = {
  deviceId: 'android-1234-5678', manufacturer: 'TECNO', model: 'KJ5', osVersion: '13', appVersion: '0.1.8', buildProfile: 'private',
  permissions: { smsDeclared: true, sendSms: true, receiveSms: false, readPhoneState: true, postNotifications: true, batteryOptimizationIgnored: false },
  simState: 'ready',
  sims: [{ slotIndex: 0, carrierName: 'Jazz', displayName: 'Jazz', countryIso: 'pk', isDefaultSms: true, selected: true, numberMasked: '•••• 0305' }],
  network: { type: 'wifi', connected: true, airplaneMode: false },
  queue: { pending: 2, attempting: 0, unknown: 1, failed: 0 },
  last: { sendAt: new Date().toISOString(), inboundAt: null, leaseAt: new Date().toISOString() },
  lastHeartbeatAt: new Date().toISOString(),
  health: { status: 'warning', reasons: [{ code: 'missing_permission_receive_sms', severity: 'warning' }, { code: 'unknown_results_pending', severity: 'warning' }], lastSeenMs: 1000 },
  campaigns: [{ id: 'c1', name: 'Bakery SMS', status: 'running' }],
};

const unknownSend = (over: Partial<RecoveryItem> = {}): RecoveryItem => ({
  _id: 'r1', type: 'unknown_send', severity: 'high', leadId: 'l1', lead: { name: 'Acme AG' }, campaignId: 'c1', conversationId: 'v1', messageId: 'm1', deviceId: 'android-1',
  details: { body: 'سلام، کیا آپ کو نیا تندور چاہیے؟', cause: 'result_lost' }, status: 'open', resolution: null,
  allowedActions: ['mark_sent', 'mark_not_sent', 'resend', 'dismiss'], createdAt: new Date().toISOString(), ...over,
});

const review: AnswerReview = {
  _id: 'rv1', reply: 'high, 5000', language: 'en', status: 'pending', createdAt: new Date().toISOString(),
  lead: { _id: 'l1', name: 'Acme AG' }, campaign: { _id: 'c1', name: 'Bakery SMS' },
  proposals: [
    { fieldKey: 'budget', label: 'Budget', type: 'currency', proposedValue: 5000, confidence: 0.55, evidence: '5000', source: 'deterministic', reason: 'no_question_keyword' },
    { fieldKey: 'email', label: 'Email', type: 'email', proposedValue: 'a@b.ch', confidence: 0.6, evidence: 'a@b.ch', source: 'ai_proposed', reason: 'model_proposal' },
  ],
};

const policy: ContactPolicySettings = {
  enabled: true, configured: true, maxTouchesPerDay: 3, maxTouchesPerWeek: 10, minGapMinutes: 60,
  channels: { voice: { perDay: 2, perWeek: 6 }, sms: { perDay: 3, perWeek: 8 }, email: { perDay: 2, perWeek: 7 }, whatsapp: { perDay: 2, perWeek: 7 } },
  quietHours: { enabled: true, start: '20:00', end: '08:00' }, updatedAt: null,
};

beforeEach(() => {
  cleanup();
  lang.locale = 'en';
  Object.values(api).forEach((fn) => fn.mockReset());
  api.recoveryCounts.mockResolvedValue({ open: 1, byType: { unknown_send: 1 } });
  api.reviewCounts.mockResolvedValue({ pending: 0 });
});

describe('SMS operations — phones', () => {
  it('shows health, the permissions checklist, masked SIM numbers as LTR data, queue and campaigns', async () => {
    api.devices.mockResolvedValue([device]);
    wrap(<SmsOpsWorkspace />);
    expect(await screen.findByText('TECNO KJ5')).toBeTruthy();
    expect(screen.getByTestId('health-badge').textContent).toBe('Needs attention');
    expect(screen.getByText('Permission missing: receive SMS')).toBeTruthy();
    expect(screen.getByText('Battery optimisation off')).toBeTruthy();
    const masked = screen.getByText('•••• 0305');
    expect(masked.tagName).toBe('BDI');
    expect(masked.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText('Sending SIM')).toBeTruthy();
    expect(screen.getByText('Bakery SMS')).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Unknown' }).getAttribute('aria-valuenow')).toBe('1');
    fireEvent.click(screen.getByText('Request resync'));
    await waitFor(() => expect(api.resync).toHaveBeenCalledWith('android-1234-5678'));
  });

  it('renders the workspace in Arabic (RTL copy, numbers still isolated LTR)', async () => {
    lang.locale = 'ar';
    api.devices.mockResolvedValue([device]);
    wrap(<SmsOpsWorkspace />);
    expect(await screen.findByText('عمليات الرسائل النصية')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /صندوق المعالجة/ })).toBeTruthy();
    expect((await screen.findByTestId('health-badge')).textContent).toBe('يحتاج إلى انتباه');
    expect(screen.getByText('•••• 0305').getAttribute('dir')).toBe('ltr');
  });
});

describe('SMS operations — recovery inbox', () => {
  it('never offers "resend" for an unknown send until it was marked as not sent', () => {
    expect(visibleActions(unknownSend())).not.toContain('resend');
    expect(visibleActions(unknownSend({ resolution: { action: 'mark_not_sent', by: 'u', at: null, note: null } }))).toContain('resend');
    expect(visibleActions(unknownSend({ type: 'delivery_failure', allowedActions: ['retry_other_sim', 'resend', 'dismiss'] }))).toContain('resend');
  });

  it('shows the reply with dir="auto", hides resend, and confirms "mark as not sent" before calling the API', async () => {
    api.recovery.mockResolvedValue(page([unknownSend()]));
    api.recoveryAction.mockResolvedValue(unknownSend({ status: 'resolved' }));
    wrap(<RecoveryInbox />);
    const body = await screen.findByTestId('recovery-body');
    expect(body.getAttribute('dir')).toBe('auto');
    expect(screen.queryByRole('button', { name: 'Resend' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as not sent' }));
    const dialog = screen.getByRole('dialog');
    expect(api.recoveryAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.recoveryAction).toHaveBeenCalledWith('r1', expect.objectContaining({ action: 'mark_not_sent' })));
  });

  it('bulk-dismisses the selected items after confirmation', async () => {
    api.recovery.mockResolvedValue(page([unknownSend(), unknownSend({ _id: 'r2', type: 'unmatched_reply', allowedActions: ['link_lead', 'dismiss'] })]));
    api.bulkDismiss.mockResolvedValue({ dismissed: 2 });
    wrap(<RecoveryInbox />);
    await screen.findAllByTestId('recovery-item');
    fireEvent.click(screen.getByLabelText('Select all'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss selected (2)' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.bulkDismiss).toHaveBeenCalledWith(['r1', 'r2'], undefined));
  });

  it('links an unmatched reply to a picked lead', async () => {
    api.recovery.mockResolvedValue(page([unknownSend({ _id: 'r3', type: 'unmatched_reply', allowedActions: ['link_lead', 'dismiss'], details: { body: 'haan, kal 5 baje call karein', fromMasked: '•••• 0305', suggestedLeads: [{ _id: 'l7', name: 'Acme AG' }] } })]));
    api.recoveryAction.mockResolvedValue({});
    wrap(<RecoveryInbox />);
    fireEvent.click(await screen.findByRole('button', { name: 'Link to a lead' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Acme AG' }));
    fireEvent.click(confirm);
    await waitFor(() => expect(api.recoveryAction).toHaveBeenCalledWith('r3', expect.objectContaining({ action: 'link_lead', leadId: 'l7' })));
  });
});

describe('SMS operations — answer reviews', () => {
  it('builds typed decisions (edit → number, reject) and sends them', async () => {
    expect(buildDecisions(review, { budget: { action: 'edit', value: ' 7000 ' }, email: { action: 'reject', value: '' } })).toEqual([
      { fieldKey: 'budget', action: 'edit', value: 7000 },
      { fieldKey: 'email', action: 'reject' },
    ]);
    api.resolveReview.mockResolvedValue({ ...review, status: 'resolved' });
    wrap(<ReviewCard review={review} />);
    expect(screen.getByTestId('review-reply').getAttribute('dir')).toBe('auto');
    expect(screen.getByText('Confidence 55%')).toBeTruthy();
    const budget = screen.getByTestId('proposal-budget');
    fireEvent.click(within(budget).getByLabelText('Edit'));
    fireEvent.change(within(budget).getByLabelText('Correct value'), { target: { value: '6500' } });
    fireEvent.click(within(screen.getByTestId('proposal-email')).getByLabelText('Reject'));
    fireEvent.click(screen.getByRole('button', { name: 'Save decisions' }));
    await waitFor(() => expect(api.resolveReview).toHaveBeenCalledWith('rv1', {
      decisions: [{ fieldKey: 'budget', action: 'edit', value: 6500 }, { fieldKey: 'email', action: 'reject' }], note: null,
    }));
  });
});

describe('SMS operations — contact policy', () => {
  it('saves only the editable fields', async () => {
    api.policy.mockResolvedValue(policy);
    api.savePolicy.mockImplementation(async (body: unknown) => ({ ...policy, ...(body as object) }));
    wrap(<ContactPolicySettingsForm />);
    const perDay = await screen.findByLabelText(/^Max contacts per 24 h/);
    fireEvent.change(perDay, { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('SMS Per 24 h'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save contact policy' }));
    await waitFor(() => expect(api.savePolicy).toHaveBeenCalledTimes(1));
    const body = api.savePolicy.mock.calls[0][0];
    expect(body).toEqual(policyPayload({ ...policy, maxTouchesPerDay: 4, channels: { ...policy.channels, sms: { perDay: 1, perWeek: 8 } } }));
    expect(body).not.toHaveProperty('configured');
  });

  it('blocks saving invalid values and turns read-only on 403', async () => {
    api.policy.mockResolvedValue(policy);
    api.savePolicy.mockRejectedValue({ response: { status: 403 } });
    wrap(<ContactPolicySettingsForm />);
    const gap = await screen.findByLabelText('Minimum gap between contacts (minutes)');
    fireEvent.change(gap, { target: { value: '' } });
    expect((screen.getByRole('button', { name: 'Save contact policy' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(gap, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save contact policy' }));
    expect((await screen.findAllByText('Only administrators can change the contact policy.')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Save contact policy' })).toBeNull();
  });

  it('shows "Skipped: contact limit" on a campaign and nothing when there were no skips', async () => {
    api.campaignSkips.mockResolvedValueOnce({ skipped: 4, skippedContactLimit: 3, blocked: 1, byReason: { daily_limit: { leads: 3, attempts: 5, nextAllowedAt: null }, do_not_contact: { leads: 1, attempts: 1, nextAllowedAt: null } } });
    const { unmount } = wrap(<ContactLimitSkips source="sim_call" campaignId="c1" />);
    expect(await screen.findByText(/Skipped: contact limit 3/)).toBeTruthy();
    expect(screen.getByText(/Daily contact limit reached: 3/)).toBeTruthy();
    expect(api.campaignSkips).toHaveBeenCalledWith('sim_call', 'c1');
    unmount();
    api.campaignSkips.mockResolvedValueOnce({ skipped: 0, skippedContactLimit: 0, blocked: 0, byReason: {} });
    wrap(<ContactLimitSkips source="ai_calling" campaignId="c2" />);
    await waitFor(() => expect(api.campaignSkips).toHaveBeenCalledWith('ai_calling', 'c2'));
    expect(screen.queryByTestId('contact-limit-skips')).toBeNull();
  });

  it('explains the next allowed contact per channel on the lead, in Arabic', async () => {
    lang.locale = 'ar';
    const d = (o: object) => ({ allowed: false, reason: null, nextAllowedAt: null, blocked: false, blockers: [], policyEnabled: true, ...o });
    api.leadStatus.mockResolvedValue({
      leadId: 'l1', nextAllowedAt: '2026-10-30T08:00:00.000Z',
      channels: { voice: d({ reason: 'quiet_hours', nextAllowedAt: '2026-10-30T08:00:00.000Z' }), sms: d({ blocked: true, reason: 'channel_suppressed' }), email: d({ allowed: true }), whatsapp: d({ allowed: true }) },
      recentTouches: [{ channel: 'sms', source: 'manual', at: new Date().toISOString(), status: 'committed', manual: true, policyWarning: 'min_gap' }],
    });
    wrap(<LeadContactPolicy leadId="l1" />);
    expect(await screen.findByText('أقرب تواصل مسموح:', { exact: false })).toBeTruthy();
    expect(within(screen.getByTestId('channel-sms')).getByText('ألغى الاشتراك في هذه القناة')).toBeTruthy();
    expect(within(screen.getByTestId('channel-email')).getByText('مسموح الآن')).toBeTruthy();
    expect(screen.getByText(/مبكر جدًا بعد آخر تواصل/)).toBeTruthy();
  });
});
