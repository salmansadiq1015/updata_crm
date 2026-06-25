import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const connections = [
  { _id: 'a', name: 'Acme CSV', providerKey: 'ACME', type: 'SUPPLIER', syncSchedule: '@daily', lastSyncStatus: 'HEALTHY', supplierName: 'Acme' },
  { _id: 'b', name: 'IGH Feed', providerKey: 'IGH', type: 'IGH', syncSchedule: '@weekly', lastSyncStatus: 'FAILED' },
];

vi.mock('../hooks/use-catalog-queries', () => ({
  useCatalogConnections: () => ({ data: { data: connections }, isLoading: false, isError: false }),
  useCatalogConnectionLogs: () => ({ data: [] }),
  useCatalogCategoryOptions: () => ({ data: [] }),
}));
vi.mock('../hooks/use-catalog-mutations', () => ({
  useCatalogConnectionMutations: () => ({
    createConnection: { mutateAsync: vi.fn() },
    updateConnection: { mutateAsync: vi.fn() },
    removeConnection: { mutate: vi.fn() },
    syncConnection: { mutate: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (k, d) => d || k }) }));

import { CatalogConnectionsManager } from './catalog-connections-manager';

describe('CatalogConnectionsManager', () => {
  it('renders connection rows', () => {
    render(<CatalogConnectionsManager />);
    expect(screen.getByText('Acme CSV')).toBeInTheDocument();
    expect(screen.getByText('IGH Feed')).toBeInTheDocument();
  });

  it('renders a search box and type + status filters', () => {
    render(<CatalogConnectionsManager />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });
});
