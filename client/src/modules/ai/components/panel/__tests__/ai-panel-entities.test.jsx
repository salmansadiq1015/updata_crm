import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AiPanelEntities } from '../ai-panel-entities';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (_key, fallback) => fallback || _key,
  }),
}));

const baseSession = {
  _id: 'voice-1',
  rawTranscript: 'Create order for Muller tomorrow',
  transcriptConfidence: 0.94,
  entities: [
    {
      _id: 'entity-1',
      entityType: 'CUSTOMER_NAME',
      value: 'Muller',
      normalizedValue: 'Muller',
      confidence: 0.93,
    },
  ],
};

describe('AiPanelEntities', () => {
  test('lets the user correct the voice transcript before confirmation', () => {
    const onConfirm = vi.fn();

    render(
      <AiPanelEntities
        session={baseSession}
        onConfirm={onConfirm}
        onCancel={() => {}}
        isConfirming={false}
      />,
    );

    const transcript = screen.getByTestId('ai-transcript-review');
    fireEvent.change(transcript, { target: { value: 'Create order for Mueller tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'ai.confirm.confirmArrow' }));

    expect(onConfirm).toHaveBeenCalledWith({
      corrections: [],
      transcriptText: 'Create order for Mueller tomorrow',
      originalTranscript: 'Create order for Muller tomorrow',
    });
  });

  test('blocks confirmation when no transcript is available', () => {
    render(
      <AiPanelEntities
        session={{ _id: 'voice-empty', entities: [] }}
        onConfirm={() => {}}
        onCancel={() => {}}
        isConfirming={false}
      />,
    );

    expect(screen.getByText('A transcript is required before the assistant can continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ai.confirm.confirmArrow' })).toBeDisabled();
  });
});
