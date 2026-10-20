import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { renderWithProviders } from '@/test/renderWithProviders';

import { AppTimeField } from '../AppTimeField';

const picker = jest.requireMock('@react-native-community/datetimepicker') as {
  DateTimePickerAndroid: { open: jest.Mock };
};

describe('AppTimeField', () => {
  it('opens the native 24h picker and reports HH:MM', async () => {
    Platform.OS = 'android';
    const onChange = jest.fn();
    await renderWithProviders(<AppTimeField value="09:00" onChange={onChange} accessibilityLabel="Start" />);
    fireEvent.press(screen.getByLabelText('Start: 09:00'));
    const options = picker.DateTimePickerAndroid.open.mock.calls[0][0];
    expect(options).toMatchObject({ mode: 'time', is24Hour: true });
    expect(options.value.getHours()).toBe(9);
    options.onChange({ type: 'set' }, new Date(2026, 0, 1, 7, 5));
    expect(onChange).toHaveBeenCalledWith('07:05');
    options.onChange({ type: 'dismissed' }, undefined);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
