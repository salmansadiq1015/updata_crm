import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AiPanelIdle } from '../ai-panel-idle';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (_key, fallback) => fallback || _key,
  }),
}));

describe('AiPanelIdle', () => {
  test('keeps the text command composer in the bottom rail', () => {
    render(
      <AiPanelIdle
        onStartRecording={() => {}}
        onTextSubmit={() => Promise.resolve()}
        isSupported
        isCreating={false}
      />,
    );

    const composer = screen.getByTestId('ai-panel-command-composer');
    expect(composer.parentElement).toHaveClass('mt-auto');
  });

  test('submits typed command and clears it after success', async () => {
    const onTextSubmit = vi.fn(() => Promise.resolve());

    render(
      <AiPanelIdle
        onStartRecording={() => {}}
        onTextSubmit={onTextSubmit}
        isSupported
        isCreating={false}
      />,
    );

    const input = screen.getByPlaceholderText('Type a command...');
    fireEvent.change(input, { target: { value: 'create service task' } });
    fireEvent.click(screen.getByLabelText('Send command'));

    await waitFor(() => expect(onTextSubmit).toHaveBeenCalledWith('create service task'));
    await waitFor(() => expect(input).toHaveValue(''));
  });
});
