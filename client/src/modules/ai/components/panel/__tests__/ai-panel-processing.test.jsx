import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AiPanelProcessing } from '../ai-panel-processing';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (_key, fallback) => fallback || _key,
  }),
}));

describe('AiPanelProcessing', () => {
  test('shows transcript text once STT has returned before entity extraction completes', () => {
    render(
      <AiPanelProcessing
        session={{ rawTranscript: 'Boiler inspection completed successfully' }}
        uploadProgress={100}
        onCancel={() => {}}
        isCancelling={false}
      />,
    );

    expect(screen.getByTestId('ai-processing-transcript')).toHaveTextContent(
      'Boiler inspection completed successfully',
    );
  });
});
