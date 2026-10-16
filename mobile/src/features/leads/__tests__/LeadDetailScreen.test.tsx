import { screen, waitFor, fireEvent } from '@testing-library/react-native';

import type { RootScreenProps } from '@/navigation/navigationTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import { leadsApi } from '../api/leadsApi';
import { LeadDetailScreen } from '../screens/LeadDetailScreen';
import type { Lead } from '../types';

jest.mock('../api/leadsApi');

const lead: Lead = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  leadNumber: 'L-0001',
  name: 'Acme AG',
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
};

function renderDetail(leadId: string) {
  const route = {
    key: 'LeadDetail',
    name: 'LeadDetail',
    params: { leadId },
  } as RootScreenProps<'LeadDetail'>['route'];
  const navigation = {
    setOptions: jest.fn(),
    navigate: jest.fn(),
  } as unknown as RootScreenProps<'LeadDetail'>['navigation'];
  return renderWithProviders(<LeadDetailScreen route={route} navigation={navigation} />);
}

beforeEach(() => jest.clearAllMocks());

describe('LeadDetailScreen', () => {
  it('rejects a malformed id from a deep link without calling the API', async () => {
    await renderDetail('not-an-id');
    expect(screen.getByText('This item no longer exists or was moved.')).toBeTruthy();
    expect(leadsApi.get).not.toHaveBeenCalled();
  });

  it('offers only the actions the lead has data for', async () => {
    jest.mocked(leadsApi.get).mockResolvedValue(lead);
    await renderDetail(lead.id);
    expect(await screen.findByRole('button', { name: 'Call Acme AG' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Email Acme AG' })).toBeNull();
  });

  it('updates the status once, even when Save is pressed repeatedly', async () => {
    jest.mocked(leadsApi.get).mockResolvedValue(lead);
    let finish!: (value: Lead) => void;
    jest.mocked(leadsApi.updateStatus).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderDetail(lead.id);

    await fireEvent.press(await screen.findByRole('button', { name: 'Change status' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Qualified' }));
    const save = screen.getByRole('button', { name: 'Save' });
    await fireEvent.press(save);
    await fireEvent.press(save);
    await fireEvent.press(save);

    expect(leadsApi.updateStatus).toHaveBeenCalledTimes(1);
    expect(leadsApi.updateStatus).toHaveBeenCalledWith(lead.id, 'qualified');
    finish({ ...lead, status: 'qualified' });
    await waitFor(() => expect(screen.getAllByText('Qualified').length).toBeGreaterThan(0));
  });
});
