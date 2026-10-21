import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { communicationApi } from '@/features/communication/api/communicationApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { OutcomePanel } from '../components/OutcomePanel';
import { emptyDraft, type AttemptDraft } from '../store/campaignOutbox';

jest.mock('@/features/communication/api/communicationApi', () => ({
  communicationApi: { qualification: jest.fn(), propose: jest.fn() },
}));

const api = jest.mocked(communicationApi);
let saved: AttemptDraft;
function Outcome() {
  const [draft, setDraft] = useState({ ...emptyDraft('a1', 't1', 'c1'), notes: 'Needs stock tracking' });
  return (
    <OutcomePanel
      draft={draft}
      onChange={(change) => setDraft((d) => ({ ...d, ...change }))}
      dialled
      evidence={{ ended: false, offhookAt: null, endedAt: null, offhookDurationSec: null }}
      leadId="l1"
      campaignTimezone="UTC"
      error={null}
      saving={false}
      onSubmit={() => {
        saved = draft;
      }}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  api.qualification.mockResolvedValue({
    schema: [],
    fields: [
      {
        fieldKey: 'need',
        label: 'Need',
        value: 'Old need',
        status: 'answered',
        source: 'user',
        evidence: null,
        updatedAt: null,
      },
    ],
  });
  api.propose.mockResolvedValue({
    available: true,
    reason: null,
    model: null,
    proposals: [
      {
        fieldKey: 'need',
        label: 'Need',
        proposedValue: 'stock tracking',
        status: 'answered',
        evidence: 'Needs stock tracking',
        confidence: null,
      },
    ],
  });
});

it('shows current CRM data and applies only reviewed suggestions to the final outcome', async () => {
  await renderWithProviders(<Outcome />);
  await fireEvent.press(screen.getByText('Answered'));
  await fireEvent.press(screen.getByText('Suggest answers from notes'));
  expect(await screen.findByText('In CRM: Old need')).toBeTruthy();
  expect(screen.getByText('stock tracking')).toBeTruthy();
  await fireEvent.press(screen.getByText('Apply selected'));
  await fireEvent.press(screen.getByText('Save outcome'));
  expect(saved.qualificationAnswers).toEqual([
    expect.objectContaining({
      fieldKey: 'need',
      value: 'stock tracking',
      source: 'ai_proposed_user_confirmed',
      evidence: 'Needs stock tracking',
    }),
  ]);
  expect(api.propose).toHaveBeenCalledWith('l1', 'Needs stock tracking', 'en');
});

it('keeps manual wrap-up usable when extraction is unavailable', async () => {
  api.propose.mockResolvedValue({
    available: false,
    reason: 'ai_not_configured',
    model: null,
    proposals: [],
  });
  await renderWithProviders(<Outcome />);
  await fireEvent.press(screen.getByText('Suggest answers from notes'));
  expect(
    await screen.findByText('AI suggestions are unavailable right now. Fill in the answers yourself.'),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText('No answer'));
  await fireEvent.press(screen.getByText('Save outcome'));
  expect(saved.outcome).toBe('no_answer');
  expect(saved.qualificationAnswers).toBeUndefined();
});
