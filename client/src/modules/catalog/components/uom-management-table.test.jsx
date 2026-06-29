// client/src/modules/catalog/components/uom-management-table.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const units = [
  { code: 'h', nameDe: 'Stunde', nameFr: 'heure', nameIt: 'ora', usageCount: 0, isSystem: false },
  { code: 'kg', nameDe: 'Kilogramm', nameFr: 'kilo', nameIt: 'chilo', usageCount: 2, isSystem: true },
];

vi.mock('../hooks/use-unit-queries', () => ({ useUnits: () => ({ data: units, isLoading: false }) }));
vi.mock('../hooks/use-unit-mutations', () => ({
  useUnitMutations: () => ({
    deleteUnit: { mutate: vi.fn() },
    createUnit: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
    updateUnit: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (k, d) => d || k }) }));

import { UomManagementTable } from './uom-management-table';

describe('UomManagementTable', () => {
  it('renders all units and a search box', () => {
    render(<UomManagementTable />);
    expect(screen.getByText('Stunde')).toBeInTheDocument();
    expect(screen.getByText('Kilogramm')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });
});
