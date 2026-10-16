import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { ApiError } from '@/services/api/apiErrors';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { RootScreenProps } from '@/navigation/navigationTypes';

import { LoginScreen } from '../screens/LoginScreen';
import { signIn } from '../services/session';
import { useSessionStore } from '../store/sessionStore';

jest.mock('../services/session', () => ({ signIn: jest.fn() }));
const mockedSignIn = jest.mocked(signIn);

async function renderLogin() {
  const navigation = { navigate: jest.fn() } as unknown as RootScreenProps<'Login'>['navigation'];
  const route = { key: 'Login', name: 'Login' } as RootScreenProps<'Login'>['route'];
  await renderWithProviders(<LoginScreen navigation={navigation} route={route} />);
  return { navigation };
}

async function fillAndSubmit(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ status: 'unauthenticated', user: null, endReason: null });
});

describe('LoginScreen', () => {
  it('validates before calling the server', async () => {
    await renderLogin();
    await fillAndSubmit('not-an-email', '');
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByText('Password is required')).toBeTruthy();
    expect(mockedSignIn).not.toHaveBeenCalled();
  });

  it('signs in with trimmed input and welcomes the user', async () => {
    mockedSignIn.mockResolvedValue({ firstName: 'Ana', fullName: 'Ana Muster' } as Awaited<
      ReturnType<typeof signIn>
    >);
    await renderLogin();
    await fillAndSubmit('  ana@example.com ', 'Secret-12345');
    await waitFor(() =>
      expect(mockedSignIn).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'Secret-12345' }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Welcome back, Ana!'));
  });

  it('shows the mapped error and clears the password when credentials are wrong', async () => {
    mockedSignIn.mockRejectedValue(
      new ApiError({ kind: 'http', status: 401, code: 'INVALID_CREDENTIALS', message: 'x' }),
    );
    await renderLogin();
    await fillAndSubmit('ana@example.com', 'wrong');
    expect(await screen.findByText('The email or password is incorrect.')).toBeTruthy();
    expect(screen.getByLabelText('Password').props.value).toBe('');
  });

  it('explains why the user is here after a session expired', async () => {
    useSessionStore.setState({ endReason: 'expired' });
    await renderLogin();
    expect(screen.getByText('Your session has expired. Please sign in again.')).toBeTruthy();
  });

  it('navigates to password recovery', async () => {
    const { navigation } = await renderLogin();
    await fireEvent.press(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword');
  });
});
