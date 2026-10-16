import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { ApiError } from '@/services/api/apiErrors';
import { renderWithProviders } from '@/test/renderWithProviders';

import { leadsApi } from '../api/leadsApi';
import { LeadFormScreen } from '../screens/LeadFormScreen';
import type { Lead } from '../types';

jest.mock('../api/leadsApi');

const ME = '64b7f0c2a1b2c3d4e5f60001';

const lead: Lead = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  leadNumber: 'L-0001',
  name: 'Acme AG',
  type: 'business',
  status: 'new',
  source: 'manual',
  address: { text: '8001 Zürich', city: 'Zürich', street: null, postalCode: '8001', country: 'CH' },
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

async function renderForm(leadId?: string) {
  const navigation = {
    navigate: jest.fn(),
    replace: jest.fn(),
    goBack: jest.fn(),
  } as unknown as RootScreenProps<'LeadForm'>['navigation'];
  const route = {
    key: 'LeadForm',
    name: 'LeadForm',
    params: leadId ? { leadId } : undefined,
  } as RootScreenProps<'LeadForm'>['route'];
  await renderWithProviders(<LeadFormScreen route={route} navigation={navigation} />);
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id: ME,
      email: 'me@updata.ch',
      firstName: 'Me',
      lastName: null,
      fullName: 'Me',
      phone: null,
      language: null,
      avatarUrl: null,
      roleName: null,
      status: 'active',
    },
  });
});

describe('LeadFormScreen — create', () => {
  it('validates locally, offers the +92 conversion, and posts the payload', async () => {
    jest.mocked(leadsApi.create).mockResolvedValue({ lead, duplicateWarning: true });
    const navigation = await renderForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Create lead' }));
    expect(await screen.findByText('Name is required')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Karachi Traders');
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '03054949624');
    // Not silently changed: the typed value stays until the user taps the suggestion.
    expect(screen.getByLabelText('Mobile').props.value).toBe('03054949624');
    await fireEvent.press(screen.getByRole('button', { name: 'PK +92' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Use +92 3054949624' }));
    expect(screen.getByLabelText('Mobile').props.value).toBe('+92 3054949624');

    await fireEvent.press(screen.getByRole('button', { name: 'Create lead' }));
    await waitFor(() => expect(leadsApi.create).toHaveBeenCalledTimes(1));
    expect(leadsApi.create).toHaveBeenCalledWith({
      name: 'Karachi Traders',
      type: 'business',
      source: 'manual',
      mobile: '+92 3054949624',
      address: { country: 'CH' },
      assignedTo: ME,
    });
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('LeadDetail', { leadId: lead.id }));
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('may already exist'));
  });

  it('blocks a local foreign number the server would reject', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Karachi Traders');
    await fireEvent.changeText(screen.getByLabelText('Phone'), '03054949624');
    await fireEvent.press(screen.getByRole('button', { name: 'Create lead' }));
    expect(
      await screen.findByText('Enter a valid number with country code, e.g. +41 44 123 45 67'),
    ).toBeTruthy();
    expect(leadsApi.create).not.toHaveBeenCalled();
  });

  it('maps server validation errors onto the fields', async () => {
    jest.mocked(leadsApi.create).mockRejectedValue(
      new ApiError({
        kind: 'http',
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'address.postalCode', message: 'Postal code rejected by server' }],
      }),
    );
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Acme');
    await fireEvent.press(screen.getByRole('button', { name: 'Create lead' }));
    expect(await screen.findByText('Postal code rejected by server')).toBeTruthy();
  });
});

describe('LeadFormScreen — edit', () => {
  it('patches only the changed fields and returns to the lead', async () => {
    jest.mocked(leadsApi.get).mockResolvedValue(lead);
    jest.mocked(leadsApi.update).mockResolvedValue({ ...lead, email: 'info@acme.ch' });
    const navigation = await renderForm(lead.id);

    await fireEvent.changeText(await screen.findByLabelText('Email'), 'info@acme.ch');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(leadsApi.update).toHaveBeenCalledTimes(1));
    expect(leadsApi.update).toHaveBeenCalledWith(lead.id, { email: 'info@acme.ch' });
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  });

  it('does not call the server when nothing changed', async () => {
    jest.mocked(leadsApi.get).mockResolvedValue(lead);
    const navigation = await renderForm(lead.id);
    await fireEvent.press(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(leadsApi.update).not.toHaveBeenCalled();
  });

  it('is read-only for a converted lead', async () => {
    jest.mocked(leadsApi.get).mockResolvedValue({ ...lead, status: 'converted' });
    await renderForm(lead.id);
    expect(await screen.findByText('Converted leads are managed as customers in the CRM.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
