// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * RTL safety of the lead's SIM call / SMS history: message bodies, notes and
 * quoted evidence take their direction from their own text (Urdu/Arabic replies
 * render right-to-left inside an English UI and vice versa), and masked numbers
 * stay a left-to-right run under the Arabic UI.
 */
const language = { t: (_k: string, fallback?: string) => fallback ?? _k, locale: 'ar', dir: 'rtl', isRTL: true };
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => language,
  LanguageProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => false, hasAnyPermission: () => false, isAdmin: false, permissions: [] }) }));
const comm = {
  id: 'c1', channel: 'sms', route: 'sim_sms_agent', destinationMasked: '•••• 0305', createdAt: new Date().toISOString(), createdByName: null,
  outcome: { disposition: 'callback_requested', connected: 'yes', notes: 'لیڈ نے کہا کل شام 5 بجے کال کریں', followUpAt: null, followUpTimezone: null, doNotContact: false },
  observed: { evidence: 'none' }, receipt: { steps: {} },
  sms: { body: 'جی ہاں، بعد میں فون کریں', sendStatus: 'sent_by_app' },
};
vi.mock('../hooks/use-lead-communications', () => ({
  useLeadCommunications: () => ({ isLoading: false, isError: false, data: { pages: [{ data: [comm] }] }, hasNextPage: false }),
  useLeadQualification: () => ({
    isLoading: false, isError: false,
    data: { schema: [], fields: [{ fieldKey: 'budget', label: 'Budget', value: '5000', status: 'answered', source: 'sms_agent', evidence: 'budget 5000 روپے', updatedAt: null }] },
  }),
  useLeadQualificationHistory: () => ({ isLoading: false, isError: false, data: undefined, hasNextPage: false }),
}));

const { LeadMobileCommunications } = await import('../ui/lead-mobile-communications');

describe('lead mobile communications under RTL', () => {
  it('marks SMS bodies, notes and evidence dir="auto" and keeps masked numbers LTR', () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LeadMobileCommunications leadId="l1" /></QueryClientProvider>);
    expect(screen.getByText('جی ہاں، بعد میں فون کریں').getAttribute('dir')).toBe('auto');
    expect(screen.getByText('لیڈ نے کہا کل شام 5 بجے کال کریں').getAttribute('dir')).toBe('auto');
    expect(screen.getByText('“budget 5000 روپے”').getAttribute('dir')).toBe('auto');
    expect(screen.getByText('•••• 0305').getAttribute('dir')).toBe('ltr');
  });
});
