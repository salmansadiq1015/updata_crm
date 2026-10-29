// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { makeT } from './test-i18n';

const mocks = vi.hoisted(() => ({
  createGrant: vi.fn(), reveal: vi.fn(), settings: vi.fn(), leadAccessLog: vi.fn(), accessLog: vi.fn(),
  hasPermission: vi.fn(() => true),
}));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: makeT(), locale: 'en' }) }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: mocks.hasPermission }) }));
vi.mock('../services/governance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/governance-api')>();
  return {
    ...actual,
    governanceApi: {
      createGrant: mocks.createGrant, reveal: mocks.reveal, settings: mocks.settings,
      leadAccessLog: mocks.leadAccessLog, accessLog: mocks.accessLog,
    },
  };
});

const { AccessReasonGate } = await import('../ui/access-reason-gate');
const { LeadPiiReveal } = await import('../ui/lead-pii-reveal');
const { LeadAccessHistory } = await import('../ui/lead-access-history');
const { isAccessReasonRequired, isMaskedValue } = await import('../services/governance-api');

const wrap = (node: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasPermission.mockReturnValue(true);
  mocks.settings.mockResolvedValue({ canViewPii: false, piiMaskedForMe: true, leadAccessMode: 'team' });
});

describe('access reason gate (break-glass)', () => {
  it('requires a reason of at least 5 characters, grants, then refetches', async () => {
    const onGranted = vi.fn();
    mocks.createGrant.mockResolvedValue({ required: true, leadId: 'L1' });
    wrap(<AccessReasonGate leadId="L1" onGranted={onGranted} />);
    const submit = screen.getByRole('button', { name: 'Open with this reason' });
    fireEvent.change(screen.getByLabelText('Reason for access'), { target: { value: 'abc' } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for access'), { target: { value: '  Coaching review  ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(onGranted).toHaveBeenCalled());
    expect(mocks.createGrant).toHaveBeenCalledWith('L1', 'Coaching review');
  });

  it('shows the server refusal inline', async () => {
    mocks.createGrant.mockRejectedValue({ message: 'Lead not found' });
    wrap(<AccessReasonGate leadId="L1" />);
    fireEvent.change(screen.getByLabelText('Reason for access'), { target: { value: 'Coaching review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open with this reason' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Lead not found');
  });

  it('recognises the 428 error code', () => {
    expect(isAccessReasonRequired({ code: 'ACCESS_REASON_REQUIRED' })).toBe(true);
    expect(isAccessReasonRequired({ code: 'NOT_FOUND' })).toBe(false);
    expect(isMaskedValue('+41 *** ***4321')).toBe(true);
    expect(isMaskedValue('+41 79 765 43 21')).toBe(false);
  });
});

describe('lead PII reveal', () => {
  it('renders nothing when contact values are not masked', () => {
    const { container } = wrap(<LeadPiiReveal lead={{ id: 'L1', phone: '+41 44 123 45 67', email: 'a@b.ch' }} />);
    expect(container.textContent).toBe('');
  });

  it('without lead:pii:view only offers the audited reveal-to-call', async () => {
    mocks.reveal.mockResolvedValue({ leadId: 'L1', purpose: 'call', values: { mobile: '+41 79 765 43 21' } });
    wrap(<LeadPiiReveal lead={{ id: 'L1', mobile: '+41 *** ***4321', email: 'j***@x.ch' }} />);
    expect(screen.getByText(/Contact details are masked/)).toBeTruthy();
    await waitFor(() => expect(mocks.settings).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Reveal contact details' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal number to call' }));
    await waitFor(() => expect(mocks.reveal).toHaveBeenCalledWith('L1', 'call', ['mobile']));
    expect(await screen.findByText('+41 79 765 43 21')).toBeTruthy();
  });

  it('with lead:pii:view offers a reveal for viewing', async () => {
    mocks.settings.mockResolvedValue({ canViewPii: true });
    mocks.reveal.mockResolvedValue({ leadId: 'L1', purpose: 'view', values: { email: 'jane@x.ch' } });
    wrap(<LeadPiiReveal lead={{ id: 'L1', email: 'j***@x.ch' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal contact details' }));
    expect(await screen.findByText('jane@x.ch')).toBeTruthy();
    expect(mocks.reveal).toHaveBeenCalledWith('L1', 'view', ['email']);
  });
});

describe('lead access history', () => {
  it('is hidden without audit:read', () => {
    mocks.hasPermission.mockReturnValue(false);
    const { container } = wrap(<LeadAccessHistory leadId="L1" />);
    expect(container.textContent).toBe('');
    expect(mocks.leadAccessLog).not.toHaveBeenCalled();
  });

  it('lists who accessed the lead with the stated reason', async () => {
    mocks.leadAccessLog.mockResolvedValue({
      data: [{ id: 'e1', timestamp: '2026-10-29T10:00:00Z', eventType: 'governance.access.cross_ownership', result: 'success', userId: 'u1', userName: 'Sam Supervisor', leadId: 'L1', leadName: 'Acme', action: 'transcript.read', reason: 'Coaching review', purpose: null, fields: null, path: null, piiMasked: null, ipAddress: null }],
      pagination: { hasNext: false, nextCursor: null, limit: 20 },
    });
    wrap(<LeadAccessHistory leadId="L1" />);
    expect(await screen.findByText('Sam Supervisor')).toBeTruthy();
    expect(screen.getByText('Read a call transcript')).toBeTruthy();
    expect(screen.getByText('“Coaching review”')).toBeTruthy();
  });
});
