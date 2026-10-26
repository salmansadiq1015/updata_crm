// A call with an unknown outcome (paired phone unplugged mid-call): the app explains it and only
// resolves it after the owner picks an outcome and confirms. Mocked API; nothing is called.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { RootScreenProps } from '@/navigation/navigationTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import { aiAgentApi } from '../api/aiAgentApi';
import { AiCallDetailScreen } from '../screens/AiCallDetailScreen';
import { callRecipientSchema, callRecordSchema, needsReconcile } from '../types';

jest.mock('../api/aiAgentApi', () => ({
  ...jest.requireActual('../api/aiAgentApi'),
  aiAgentApi: { getCall: jest.fn(), reconcileCall: jest.fn() },
}));

const parked = callRecordSchema.parse({
  _id: 'c1', state: 'needs_reconcile', disposition: 'needs_review', reviewRequired: true, provider: 'paired_phone',
  failureCode: 'GATEWAY_OUTCOME_UNKNOWN', failureMessage: 'ESP32 link lost: unplugged', durationSeconds: 14, answers: [],
  campaignId: { _id: 'k1', name: 'Paired run' }, leadId: { _id: '64b7f0c2a1b2c3d4e5f60718', name: 'Lahore Bakers' },
  reconciliation: { needed: true, note: null, resolvedAt: null, resolution: null },
});

function renderDetail() {
  const route = { key: 'AiCallDetail', name: 'AiCallDetail', params: { callId: 'c1' } } as RootScreenProps<'AiCallDetail'>['route'];
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  return renderWithProviders(
    <AiCallDetailScreen route={route} navigation={navigation as unknown as RootScreenProps<'AiCallDetail'>['navigation']} />,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('unknown call outcome on Android', () => {
  it('parses the reconcile state and the recipient’s last call', () => {
    expect(needsReconcile(parked)).toBe(true);
    expect(needsReconcile({ ...parked, reconciliation: { resolvedAt: '2026-10-24T08:00:00Z', resolution: 'reached', note: null } })).toBe(false);
    const r = callRecipientSchema.parse({ _id: 'r1', state: 'failed', finalDisposition: 'needs_reconcile', lastCallId: 'c1', leadId: { _id: 'l1' } });
    expect(r.lastCallId).toBe('c1');
  });

  it('explains the outcome and records the owner’s choice only after confirming', async () => {
    jest.mocked(aiAgentApi.getCall).mockResolvedValue(parked);
    jest.mocked(aiAgentApi.reconcileCall).mockResolvedValue({ ...parked, state: 'failed' });
    await renderDetail();
    expect(await screen.findByRole('header', { name: 'Outcome unknown' })).toBeTruthy();
    expect(screen.getByText(/never called again automatically/)).toBeTruthy();
    expect(screen.queryByText('The AI marked this result for human review.')).toBeNull();

    await fireEvent.press(screen.getByText('Not reached · call again'));
    expect(aiAgentApi.reconcileCall).not.toHaveBeenCalled(); // a confirmation first
    expect(await screen.findByText('Record this outcome?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Record'));
    await waitFor(() => expect(aiAgentApi.reconcileCall).toHaveBeenCalledWith('c1', 'retry'));
  });

  it('a resolved call shows no reconcile actions', async () => {
    jest.mocked(aiAgentApi.getCall).mockResolvedValue({ ...parked, state: 'completed', reconciliation: { resolvedAt: '2026-10-24T08:00:00Z', resolution: 'reached', note: null } });
    await renderDetail();
    expect(await screen.findByText('The AI marked this result for human review.')).toBeTruthy();
    expect(screen.queryByText('Not reached · call again')).toBeNull();
  });
});
