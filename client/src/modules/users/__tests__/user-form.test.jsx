import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserForm } from '../components/user-form';

const t = (key, fallback) => fallback || key;
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t, locale: 'en' }) }));
const roles = [{ _id: 'role-1', name: 'Admin' }];
const profile = {
  _id: 'user-1', firstName: 'New', lastName: 'Admin', email: 'new@example.ch',
  role: roles[0], birthDate: null, schedulingSkills: ['Repair'], schedulingCertifications: ['Safety'],
};

describe('user form save lifecycle', () => {
  it('preserves data after a failed save, normalizes empty birth dates, and closes only on success', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Email already exists')).mockResolvedValueOnce({});
    const onOpenChange = vi.fn();
    render(<UserForm open onOpenChange={onOpenChange} onSubmit={onSubmit} defaultValues={profile} roles={roles} />);
    const firstName = screen.getByDisplayValue('New');
    await user.clear(firstName);
    await user.type(firstName, 'Corrected');
    await user.click(screen.getByRole('button', { name: 'users.save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      firstName: 'Corrected', birthDate: null, schedulingSkills: ['Repair'], schedulingCertifications: ['Safety'],
    }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(firstName).toHaveValue('Corrected');
    await user.click(screen.getByRole('button', { name: 'users.save' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});


it('omits role changes when a profile editor saves a user', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue({});
  render(<UserForm open onOpenChange={vi.fn()} onSubmit={onSubmit} defaultValues={profile} roles={roles} canManageRole={false} />);
  await user.click(screen.getByRole('button', { name: 'users.save' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('roleId');
});


describe('new-user passwords', () => {
  async function openAccessStep(user) {
    await user.type(screen.getByPlaceholderText('Max'), 'New');
    await user.type(screen.getByPlaceholderText('Muster'), 'User');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByPlaceholderText('max.muster@updata.ai'), 'new@example.ch');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
  }

  it('validates confirmation, supports reveal and submits the password without confirmation', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<UserForm open onOpenChange={vi.fn()} onSubmit={onSubmit} roles={[{ _id: 'role-1', name: 'User' }]} />);
    await openAccessStep(user);
    const password = screen.getByLabelText('Password', { exact: true });
    const confirmation = screen.getByLabelText('Confirm password');
    expect(password).toHaveAttribute('type', 'password');
    await user.type(password, 'ChosenCredential123!');
    await user.type(confirmation, 'WrongPassword123!');
    await user.click(screen.getByRole('button', { name: 'users.create' }));
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.clear(confirmation);
    await user.type(confirmation, 'ChosenCredential123!');
    await user.click(screen.getByRole('button', { name: 'users.create' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].password).toBe('ChosenCredential123!');
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('confirmPassword');
  });

  it('keeps the current password when both edit fields are blank', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<UserForm open onOpenChange={vi.fn()} onSubmit={onSubmit} defaultValues={profile} roles={roles} />);
    await user.click(screen.getByRole('button', { name: /Access/ }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'users.save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('password');
  });
});


it('allows administrators to update a password with matching confirmation', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue({});
  render(<UserForm open onOpenChange={vi.fn()} onSubmit={onSubmit} defaultValues={profile} roles={roles} />);
  await user.click(screen.getByRole('button', { name: /Access/ }));
  await user.type(screen.getByLabelText('Password', { exact: true }), 'ReplacementCredential123!');
  await user.type(screen.getByLabelText('Confirm password'), 'MismatchCredential123!');
  await user.click(screen.getByRole('button', { name: 'users.save' }));
  expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText('Confirm password'));
  await user.type(screen.getByLabelText('Confirm password'), 'ReplacementCredential123!');
  await user.click(screen.getByRole('button', { name: 'users.save' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0][0].password).toBe('ReplacementCredential123!');
  expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('confirmPassword');
});

it('hides password changes from profile editors', async () => {
  const user = userEvent.setup();
  render(<UserForm open onOpenChange={vi.fn()} onSubmit={vi.fn()} defaultValues={profile} roles={roles} canManageRole={false} />);
  await user.click(screen.getByRole('button', { name: /Access/ }));
  expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument();
});
