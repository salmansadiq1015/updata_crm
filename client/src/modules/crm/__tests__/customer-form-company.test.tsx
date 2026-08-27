import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { CustomerForm } from '../components/customer-form';

// The form asks what the user may do since the permission gate landed on it.
// Without the store, usePermissions throws before anything renders.
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    user: { permissions: ['crm:read', 'crm:write'] },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock('@/modules/crm/services/customer-service', () => ({
  customerService: {
    findDuplicates: vi.fn().mockResolvedValue({ hasDuplicates: false, duplicates: [] }),
  },
}));

vi.mock('@/modules/ai', () => ({
  AiVoiceCapture: () => null,
  SESSION_TYPES: { ADDRESS_CAPTURE: 'ADDRESS_CAPTURE' },
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('CustomerForm company flow', () => {
  it('shows owner and UID fields for company customers without step connector lines', async () => {
    const user = userEvent.setup();
    const { container } = renderWithClient(
      <CustomerForm
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        defaultValues={null}
        isLoading={false}
      />,
    );

    // The Partner card describes itself as "Firma oder Privat", so a loose
    // /firma/i matches two cards. Each card's accessible name is its title plus
    // its description, and only the business one says "Unternehmen".
    await user.click(screen.getByRole('button', { name: /firma\s*unternehmen/i }));

    expect(screen.getByText('Firmenname')).toBeInTheDocument();
    expect(screen.getByText('Inhabername')).toBeInTheDocument();
    expect(screen.getByText('UID Nummer')).toBeInTheDocument();
    expect(container.querySelector('.h-px.w-4')).toBeNull();
    expect(container.querySelector('.h-px.sm\\:w-6')).toBeNull();
  });
});
