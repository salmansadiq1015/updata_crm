import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { LineItemsEditor } from '../components/line-items-editor';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ locale: 'en', t: (key: string) => key }),
}));

vi.mock('@/modules/catalog/components/article-picker-dialog', () => ({
  ArticlePickerDialog: ({ open, onSelect }: { open: boolean; onSelect: (value: unknown) => void }) => (
    open ? (
      <button
        type="button"
        onClick={() => onSelect({
          catalogArticleId: '64f000000000000000000001',
          articleNumber: 'A001',
          name: 'Copper pipe',
          unitOfMeasure: 'm',
          snapshotPrice: 14.5,
          type: 'MATERIAL',
          source: 'INTERNAL',
          catalogSnapshot: {
            catalogArticleId: '64f000000000000000000001',
            articleNumber: 'A001',
            articleName: 'Copper pipe',
            unitOfMeasure: 'm',
            snapshotBasePrice: 14.5,
            catalogSource: 'INTERNAL',
          },
        })}
      >
        Pick mocked article
      </button>
    ) : null
  ),
}));

vi.mock('../components/catalog-line-price-drift', () => ({
  CatalogLinePriceDrift: () => null,
}));

describe('LineItemsEditor catalog integration', () => {
  it('adds catalog-selected items with immutable snapshot data', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<LineItemsEditor value={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /catalog article/i }));
    await user.click(screen.getByRole('button', { name: /pick mocked article/i }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'material',
        catalogItemId: '64f000000000000000000001',
        articleNumber: 'A001',
        description: 'Copper pipe',
        unit: 'm',
        unitPrice: 14.5,
        lineTotal: 14.5,
        catalogSnapshot: expect.objectContaining({
          catalogArticleId: '64f000000000000000000001',
          snapshotBasePrice: 14.5,
          catalogSource: 'INTERNAL',
        }),
      }),
    ]);
  });
});
