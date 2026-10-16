import { fireEvent, screen } from '@testing-library/react-native';

import type { MainTabScreenProps } from '@/navigation/navigationTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import { leadsApi } from '../api/leadsApi';
import { LeadsScreen } from '../screens/LeadsScreen';
import type { Lead } from '../types';

const mockStartAiAgent = jest.fn();
jest.mock('@/features/aiAgent/hooks/useAiAgent', () => ({
  useStartAiAgent: () => mockStartAiAgent,
}));
jest.mock('../api/leadsApi');

const lead = (id: string, name: string): Lead => ({
  id,
  leadNumber: null,
  name,
  type: 'business',
  status: 'new',
  source: 'manual',
  address: null,
  phone: '+41 44 123 45 67',
  mobile: null,
  email: null,
  website: null,
  mapsUrl: null,
  assignedTo: null,
  notes: null,
  tags: [],
  lastContactedAt: null,
  lastContactChannel: null,
  createdAt: null,
});

const LEADS = [
  lead('64b7f0c2a1b2c3d4e5f60701', 'Acme AG'),
  lead('64b7f0c2a1b2c3d4e5f60702', 'Beta GmbH'),
  lead('64b7f0c2a1b2c3d4e5f60703', 'Gamma SA'),
];

const navigation = { navigate: jest.fn() };

function renderLeads() {
  return renderWithProviders(
    <LeadsScreen
      route={{ key: 'Leads', name: 'Leads' } as MainTabScreenProps<'Leads'>['route']}
      navigation={navigation as unknown as MainTabScreenProps<'Leads'>['navigation']}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(leadsApi.list).mockResolvedValue({
    items: LEADS,
    pagination: { hasNext: false, nextCursor: null, limit: 25, total: 3 },
  });
});

describe('LeadsScreen multi-select', () => {
  it('long-press starts selection; taps toggle; the bar hands exactly those ids to the AI agent', async () => {
    await renderLeads();
    await fireEvent(await screen.findByRole('button', { name: /^Acme AG/ }), 'longPress');

    expect(screen.getByText('1 lead selected')).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();

    // In selection mode a tap toggles instead of opening the lead.
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Gamma SA/ }));
    expect(screen.getByText('2 leads selected')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Acme AG/ }));
    expect(screen.getByText('1 lead selected')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Beta GmbH/ }));

    await fireEvent.press(screen.getByRole('button', { name: 'Give to AI agent (2)' }));
    expect(mockStartAiAgent).toHaveBeenCalledWith(['64b7f0c2a1b2c3d4e5f60702', '64b7f0c2a1b2c3d4e5f60703']);
    expect(navigation.navigate).not.toHaveBeenCalledWith('LeadDetail', expect.anything());
    // Selection mode ends after handing over.
    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it('the Select action, "select all shown" and cancel work from the header', async () => {
    await renderLeads();
    await screen.findByText('Acme AG');
    await fireEvent.press(screen.getByRole('button', { name: 'Select leads for the AI agent' }));
    expect(screen.getByText('0 leads selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Give to AI agent (0)' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Select all shown' }));
    expect(screen.getByText('3 leads selected')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel selection' }));
    expect(screen.queryByText('3 leads selected')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Acme AG/ }));
    expect(navigation.navigate).toHaveBeenCalledWith('LeadDetail', { leadId: '64b7f0c2a1b2c3d4e5f60701' });
  });

  it('opens the AI agent campaigns from the header', async () => {
    await renderLeads();
    await fireEvent.press(screen.getByRole('button', { name: 'AI agent campaigns' }));
    expect(navigation.navigate).toHaveBeenCalledWith('AiAgentCampaigns');
  });
});
