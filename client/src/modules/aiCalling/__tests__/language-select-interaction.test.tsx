import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageSelect } from '../ui/language-select';

vi.mock('../hooks/use-ai-calling', () => ({
  useAgentLanguages: () => ({ data: { languages: [
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', support: 'full', rtl: true },
    { code: 'ar-MA', name: 'Arabic (Morocco, Moroccan Darija)', nativeName: 'العربية المغربية — الدارجة المغربية', support: 'limited', rtl: true },
    { code: 'zgh', name: 'Tamazight (Standard Moroccan Amazigh)', nativeName: 'ⵜⴰⵎⴰⵣⵉⵖⵜ', support: 'limited', rtl: false },
  ] }, isLoading: false, isError: false }),
}));

describe('Moroccan conversation language selection', () => {
  it('finds and selects Darija as its own language rather than generic Arabic', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LanguageSelect value="ar" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Conversation language' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search languages' }), { target: { value: 'Arabic Morocco' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Moroccan Darija/ }));
    expect(onChange).toHaveBeenCalledWith('ar-MA');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    rerender(<LanguageSelect value="ar-MA" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Conversation language' })).toHaveTextContent('Moroccan Darija');
    expect(screen.getByText(/Limited support:/)).toBeInTheDocument();
  });
});
