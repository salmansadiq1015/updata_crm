import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  describe, expect, test, vi, beforeEach,
} from 'vitest';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (key, fallback) => fallback || key }),
}));

const sendMock = vi.fn(() => Promise.resolve({ data: { _id: 'email-1' } }));

vi.mock('../services/EmailService', () => ({
  emailService: {
    send: (...args) => sendMock(...args),
    compose: vi.fn(),
    retry: vi.fn(),
  },
}));

import { EmailComposeModal } from '../components/EmailComposeModal';

function renderModal(initialValues) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmailComposeModal open onClose={() => {}} initialValues={initialValues} />
    </QueryClientProvider>,
  );
}

const baseValues = {
  to: 'kunde@example.com',
  subject: 'Offerte OFF-1',
  bodyHtml: '<p>Hallo</p>',
  attachments: [
    { id: 'doc-1', fileName: 'OFF-2026-0042_Muster_AG.pdf' },
    { id: 'doc-2', fileName: 'Begleitschreiben.pdf' },
  ],
  sourceModule: 'qop',
  sourceRecordId: 'rec-1',
};

describe('EmailComposeModal attachments (DOC-008)', () => {
  beforeEach(() => sendMock.mockClear());

  test('lists the attached documents', () => {
    renderModal(baseValues);
    expect(screen.getByText('OFF-2026-0042_Muster_AG.pdf')).toBeInTheDocument();
    expect(screen.getByText('Begleitschreiben.pdf')).toBeInTheDocument();
  });

  test('removes an attachment when its remove control is clicked', () => {
    renderModal(baseValues);
    const removeButtons = screen.getAllByLabelText('doctpl.email.removeAttachment');
    fireEvent.click(removeButtons[0]);
    expect(screen.queryByText('OFF-2026-0042_Muster_AG.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Begleitschreiben.pdf')).toBeInTheDocument();
  });

  test('sends the remaining attachment ids as documentIds', async () => {
    renderModal(baseValues);
    fireEvent.click(screen.getAllByLabelText('doctpl.email.removeAttachment')[0]);
    fireEvent.click(screen.getByText('common.send'));

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    const payload = sendMock.mock.calls[0][0];
    expect(payload.documentIds).toEqual(['doc-2']);
    expect(payload.documentId).toBe('doc-2');
    expect(payload.to).toEqual(['kunde@example.com']);
  });

  test('disables sending when all attachments are removed', () => {
    renderModal(baseValues);
    const removeButtons = screen.getAllByLabelText('doctpl.email.removeAttachment');
    fireEvent.click(removeButtons[0]);
    fireEvent.click(screen.getAllByLabelText('doctpl.email.removeAttachment')[0]);
    expect(screen.getByText('common.send').closest('button')).toBeDisabled();
  });
});
