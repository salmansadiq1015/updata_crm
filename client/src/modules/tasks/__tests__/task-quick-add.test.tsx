import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskQuickAdd } from '../ui/task-quick-add';

vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));

describe('task quick capture', () => {
  it('preserves a failed draft and clears it only after a successful retry', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ id: 'created' });
    render(<TaskQuickAdd label="Add task" onCreate={create} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    const input = screen.getByRole('textbox', { name: 'Add task' });
    fireEvent.change(input, { target: { value: 'Prepare launch' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'false'));
    expect(input).toHaveValue('Prepare launch');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(input).toHaveValue(''));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('prevents duplicate submissions while a creation is pending', async () => {
    let resolve!: () => void;
    const create = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    render(<TaskQuickAdd label="Add task" onCreate={create} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    const input = screen.getByRole('textbox', { name: 'Add task' });
    fireEvent.change(input, { target: { value: 'Prepare launch' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(input).toHaveValue('');
  });
});
