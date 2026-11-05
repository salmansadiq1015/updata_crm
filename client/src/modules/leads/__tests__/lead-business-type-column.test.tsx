import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { useLeadColumns } from '../ui/lead-table-columns';
import { leadSchema } from '../schemas/lead-schemas';
import { makeLeadDTO } from './mocks/data';
import type { Lead } from '../types/lead-types';

vi.mock('../ui/lead-ui-kit', () => ({
  useLanguage: () => ({ t: (_key: string, fallback: string) => fallback, locale: 'en' }),
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

function showType(businessType: string | null, discoveryBusinessTypes: unknown[]) {
  const lead = leadSchema.parse(makeLeadDTO({ source: 'extension', sourceMetadata: { businessType, discoveryBusinessTypes } }));
  const { result } = renderHook(() => useLeadColumns({ users: [], canWrite: false, onOpen: vi.fn(), onCopyPhone: vi.fn(), onEditContact: vi.fn() }));
  const Cell = result.current.find((column) => column.id === 'type')!.Cell as ComponentType<{ row: { original: Lead } }>;
  render(<Cell row={{ original: lead }} />);
}

describe('CRM Type column for Hotel discoveries', () => {
  it.each(['Hotel', 'Add a label', null])('renders Hotel for saved category %s with Hotel provenance', (businessType) => {
    showType(businessType, ['Hotel']);
    expect(screen.getByText('Hotel')).toBeInTheDocument();
    expect(screen.queryByText('Add a label')).not.toBeInTheDocument();
  });
  it('retains a more specific real category', () => {
    showType('Boutique hotel', [{ id: 'hotel', name: 'Hotel' }]);
    expect(screen.getByText('Boutique hotel')).toBeInTheDocument();
  });
  it('does not invent Hotel when saved evidence is absent', () => {
    showType('Add a label', []);
    expect(screen.queryByText('Add a label')).not.toBeInTheDocument();
    expect(screen.queryByText('Hotel')).not.toBeInTheDocument();
  });
});
