import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';

import { DeviceHealthCard, SmsCallbacksCard } from '../components/SmsDeviceOpsCards';
import { useDeviceHealth, useSmsCallbacks } from '../hooks/useSmsDeviceOps';

jest.mock('../hooks/useSmsDeviceOps', () => ({ useDeviceHealth: jest.fn(), useSmsCallbacks: jest.fn() }));

it('lists callback requests with the due time or "needs a time" and the lead\'s own words', async () => {
  jest.mocked(useSmsCallbacks).mockReturnValue({
    data: [
      { id: 'f1', leadId: 'l1', leadName: 'Zafar Traders', dueAt: '2026-10-30T12:00:00.000Z', needsTime: false, evidence: 'kal shaam 5 baje call karein' },
      { id: 'f2', leadId: 'l2', leadName: 'Bäckerei Muster', dueAt: null, needsTime: true, evidence: 'بعد میں فون کریں' },
    ],
  } as never);
  const open = jest.fn();
  await renderWithProviders(<SmsCallbacksCard onOpenLead={open} />);
  expect(screen.getByText('Callback requests')).toBeTruthy();
  expect(screen.getByText('Needs a time')).toBeTruthy();
  expect(screen.getByText('“بعد میں فون کریں”')).toBeTruthy();
  expect(screen.getByText('“kal shaam 5 baje call karein”').props.style).toEqual(
    expect.objectContaining({ writingDirection: 'auto' }),
  );
  await fireEvent.press(screen.getByLabelText('Zafar Traders'));
  expect(open).toHaveBeenCalledWith('l1');
});

it('renders nothing without callbacks', async () => {
  jest.mocked(useSmsCallbacks).mockReturnValue({ data: [] } as never);
  await renderWithProviders(<SmsCallbacksCard onOpenLead={jest.fn()} />);
  expect(screen.queryByText('Callback requests')).toBeNull();
});

it('shows the CRM health verdict with the most severe reasons first', async () => {
  jest.mocked(useDeviceHealth).mockReturnValue({
    resyncRequested: false,
    health: {
      status: 'warning',
      reasons: [
        { code: 'battery_optimization_on', severity: 'warning' },
        { code: 'airplane_mode', severity: 'critical' },
      ],
    },
  });
  await renderWithProviders(<DeviceHealthCard />);
  expect(screen.getByText('Needs attention')).toBeTruthy();
  expect(screen.getByText('Airplane mode is on.')).toBeTruthy();
});
