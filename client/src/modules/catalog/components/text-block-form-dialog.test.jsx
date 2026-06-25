import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock the shared editor — avoid mounting ProseMirror in jsdom.
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({ value }) => <div data-testid="shared-editor">{value}</div>,
}));
vi.mock('../hooks/use-text-block-mutations', () => ({
  useTextBlockMutations: () => ({
    createTextBlock: { mutateAsync: vi.fn(), isPending: false },
    updateTextBlock: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('../hooks/use-catalog-queries', () => ({ useCatalogCategories: () => ({ data: [] }) }));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (k, d) => d || k }) }));

import { TextBlockFormDialog } from './text-block-form-dialog';

describe('TextBlockFormDialog', () => {
  it('renders the shared RichTextEditor (not the inline one)', () => {
    render(<TextBlockFormDialog open onClose={() => {}} textBlock={{ _id: '1', bodyHtml: '<p>hi</p>' }} />);
    expect(screen.getByTestId('shared-editor')).toBeInTheDocument();
  });

  it('uses sticky footer with Save and Cancel', () => {
    render(<TextBlockFormDialog open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
