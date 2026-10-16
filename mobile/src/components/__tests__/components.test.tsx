import { fireEvent, screen } from '@testing-library/react-native';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppInput } from '@/components/ui/AppInput';
import { AppPasswordInput } from '@/components/ui/AppPasswordInput';
import { ApiError } from '@/services/api/apiErrors';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('AppButton', () => {
  it('is an accessible button that fires onPress', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<AppButton title="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses an explicit accessibility label when given', async () => {
    await renderWithProviders(
      <AppButton title="Call" accessibilityLabel="Call Acme AG" onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Call Acme AG' })).toBeTruthy();
  });

  it('blocks presses and announces busy while loading', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<AppButton title="Sign in" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Sign in' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(screen.getByTestId('app-button-spinner')).toBeTruthy();
  });

  it('blocks presses when disabled', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<AppButton title="Save" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('AppInput', () => {
  it('labels the field and reports text changes', async () => {
    const onChangeText = jest.fn();
    await renderWithProviders(<AppInput label="Email" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    expect(onChangeText).toHaveBeenCalledWith('ana@example.com');
  });

  it('shows the validation error instead of the helper text', async () => {
    await renderWithProviders(
      <AppInput label="Email" helperText="Work address" error="Enter a valid email address" />,
    );
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(screen.queryByText('Work address')).toBeNull();
  });

  it('is not editable when disabled', async () => {
    await renderWithProviders(<AppInput label="Email" disabled />);
    expect(screen.getByLabelText('Email').props.editable).toBe(false);
  });

  it('password input hides text and can reveal it', async () => {
    await renderWithProviders(<AppPasswordInput label="Password" />);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy();
  });
});

describe('ConfirmDialog', () => {
  const props = { visible: true, title: 'Sign out?', confirmLabel: 'Sign out', destructive: true };

  it('confirms and cancels', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderWithProviders(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cannot be confirmed twice or cancelled while the action runs', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderWithProviders(<ConfirmDialog {...props} loading onConfirm={onConfirm} onCancel={onCancel} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('AppErrorState', () => {
  it('shows mapped copy (never the server text) with a retry for transient errors', async () => {
    const onRetry = jest.fn();
    await renderWithProviders(
      <AppErrorState
        error={new ApiError({ kind: 'http', status: 503, message: 'upstream exploded' })}
        onRetry={onRetry}
      />,
    );
    expect(
      screen.getByText('Something went wrong on the server. Please try again in a moment.'),
    ).toBeTruthy();
    expect(screen.queryByText('upstream exploded')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('offers no retry for permission failures', async () => {
    await renderWithProviders(
      <AppErrorState error={new ApiError({ kind: 'http', status: 403, message: 'x' })} onRetry={jest.fn()} />,
    );
    expect(screen.getByText('You do not have permission to do this.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
