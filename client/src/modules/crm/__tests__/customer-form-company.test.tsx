import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { CustomerForm } from '../components/customer-form';

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

    await user.click(screen.getByRole('button', { name: /firma/i }));

    expect(screen.getByText('Firmenname')).toBeInTheDocument();
    expect(screen.getByText('Inhabername')).toBeInTheDocument();
    expect(screen.getByText('UID Nummer')).toBeInTheDocument();
    expect(container.querySelector('.h-px.w-4')).toBeNull();
    expect(container.querySelector('.h-px.sm\\:w-6')).toBeNull();
  });
});
