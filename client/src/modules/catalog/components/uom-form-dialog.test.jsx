import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../hooks/use-unit-mutations', () => ({
  useUnitMutations: () => ({
    createUnit: { mutateAsync: vi.fn(), isPending: false },
    updateUnit: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (k, d) => d || k }) }));

import { UomFormDialog } from './uom-form-dialog';

describe('UomFormDialog', () => {
  it('renders inside a scrollable dialog body with a sticky footer', () => {
    render(<UomFormDialog open onClose={() => {}} unit={null} />);
    expect(document.body.querySelector('[data-slot="dialog-body"]')).toBeTruthy();
    expect(document.body.querySelector('[data-slot="dialog-footer"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
