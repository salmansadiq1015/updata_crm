import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { AssigneeSelector } from '../ui/assignee-selector';

type WorkspaceUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

const USERS: WorkspaceUser[] = [
  { id: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', avatarUrl: null },
  { id: 'u2', firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com', avatarUrl: null },
];

beforeEach(() => {
  window.localStorage.setItem('mb-locale', 'en');
  vi.clearAllMocks();
});

function renderWithProviders(ui: ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('AssigneeSelector', () => {
  describe('unassigned state', () => {
    it('renders "Assign" text when assigneeIds is empty and users list is empty', () => {
      renderWithProviders(
        <AssigneeSelector assigneeIds={[]} users={[]} onAssigneeChange={vi.fn()} />
      );
      expect(screen.getByText('Assign')).toBeInTheDocument();
    });

    it('renders "Assign" text when assigneeIds is empty even with users provided', () => {
      renderWithProviders(
        <AssigneeSelector assigneeIds={[]} users={USERS} onAssigneeChange={vi.fn()} />
      );
      expect(screen.getByText('Assign')).toBeInTheDocument();
    });
  });

  describe('assigned state', () => {
    it('shows user initials when assigneeIds contains a user in the users list', () => {
      renderWithProviders(
        <AssigneeSelector assigneeIds={['u1']} users={USERS} onAssigneeChange={vi.fn()} />
      );
      // Initials for Alice Smith = "AS"
      expect(screen.getByText('AS')).toBeInTheDocument();
    });

    it('shows the user full name when a single user is assigned', () => {
      renderWithProviders(
        <AssigneeSelector assigneeIds={['u1']} users={USERS} onAssigneeChange={vi.fn()} />
      );
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    it('shows count when multiple users are assigned', () => {
      renderWithProviders(
        <AssigneeSelector assigneeIds={['u1', 'u2']} users={USERS} onAssigneeChange={vi.fn()} />
      );
      expect(screen.getByText('2 Assignees')).toBeInTheDocument();
    });
  });

  describe('popover interaction', () => {
    it('opens the popover with user list when the trigger button is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <AssigneeSelector assigneeIds={[]} users={USERS} onAssigneeChange={vi.fn()} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      // After click the popover content should appear in the DOM (via Portal into document.body)
      expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
      expect(await screen.findByText('Bob Jones')).toBeInTheDocument();
    });

    it('shows "Unassigned" option in the popover', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <AssigneeSelector assigneeIds={['u1']} users={USERS} onAssigneeChange={vi.fn()} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      expect(await screen.findByText('Unassigned')).toBeInTheDocument();
    });

    it('calls onAssigneeChange with array containing the clicked user id', async () => {
      const onAssigneeChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <AssigneeSelector assigneeIds={[]} users={USERS} onAssigneeChange={onAssigneeChange} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      const aliceButton = await screen.findByRole('button', { name: /Alice Smith/i });
      await user.click(aliceButton);

      expect(onAssigneeChange).toHaveBeenCalledWith(['u1']);
      expect(onAssigneeChange).toHaveBeenCalledTimes(1);
    });

    it('calls onAssigneeChange with empty array when "Unassigned" is clicked', async () => {
      const onAssigneeChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <AssigneeSelector assigneeIds={['u1']} users={USERS} onAssigneeChange={onAssigneeChange} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      const unassignedBtn = await screen.findByRole('button', { name: /Unassigned/i });
      await user.click(unassignedBtn);

      expect(onAssigneeChange).toHaveBeenCalledWith([]);
    });

    it('shows "No users found" when search yields no results', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <AssigneeSelector assigneeIds={[]} users={USERS} onAssigneeChange={vi.fn()} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      const searchInput = await screen.findByPlaceholderText('Search members...');
      await user.type(searchInput, 'zzznomatch');

      expect(await screen.findByText('No members found')).toBeInTheDocument();
    });
  });
});
