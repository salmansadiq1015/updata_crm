import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  vi.clearAllMocks();
});

describe('AssigneeSelector', () => {
  describe('unassigned state', () => {
    it('renders "Assign" text when assigneeId is null and users list is empty', () => {
      render(
        <AssigneeSelector assigneeId={null} users={[]} onAssigneeChange={vi.fn()} />
      );
      expect(screen.getByText('Assign')).toBeInTheDocument();
    });

    it('renders "Assign" text when assigneeId is null even with users provided', () => {
      render(
        <AssigneeSelector assigneeId={null} users={USERS} onAssigneeChange={vi.fn()} />
      );
      expect(screen.getByText('Assign')).toBeInTheDocument();
    });
  });

  describe('assigned state', () => {
    it('shows user initials when assigneeId matches a user in the users list', () => {
      render(
        <AssigneeSelector assigneeId="u1" users={USERS} onAssigneeChange={vi.fn()} />
      );
      // Initials for Alice Smith = "AS"
      expect(screen.getByText('AS')).toBeInTheDocument();
    });

    it('shows the user full name when assigned', () => {
      render(
        <AssigneeSelector assigneeId="u1" users={USERS} onAssigneeChange={vi.fn()} />
      );
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    it('shows initials for second user when their id is assigned', () => {
      render(
        <AssigneeSelector assigneeId="u2" users={USERS} onAssigneeChange={vi.fn()} />
      );
      // Initials for Bob Jones = "BJ"
      expect(screen.getByText('BJ')).toBeInTheDocument();
    });
  });

  describe('popover interaction', () => {
    it('opens the popover with user list when the trigger button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <AssigneeSelector assigneeId={null} users={USERS} onAssigneeChange={vi.fn()} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      // After click the popover content should appear in the DOM (via Portal into document.body)
      expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
      expect(await screen.findByText('Bob Jones')).toBeInTheDocument();
    });

    it('shows "Unassigned" option in the popover', async () => {
      const user = userEvent.setup();

      render(
        <AssigneeSelector assigneeId="u1" users={USERS} onAssigneeChange={vi.fn()} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      expect(await screen.findByText('Unassigned')).toBeInTheDocument();
    });

    it('calls onAssigneeChange with the clicked user id', async () => {
      const onAssigneeChange = vi.fn();
      const user = userEvent.setup();

      render(
        <AssigneeSelector assigneeId={null} users={USERS} onAssigneeChange={onAssigneeChange} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      const aliceButton = await screen.findByRole('button', { name: /Alice Smith/i });
      await user.click(aliceButton);

      expect(onAssigneeChange).toHaveBeenCalledWith('u1');
      expect(onAssigneeChange).toHaveBeenCalledTimes(1);
    });

    it('calls onAssigneeChange with null when "Unassigned" is clicked', async () => {
      const onAssigneeChange = vi.fn();
      const user = userEvent.setup();

      render(
        <AssigneeSelector assigneeId="u1" users={USERS} onAssigneeChange={onAssigneeChange} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      const unassignedBtn = await screen.findByRole('button', { name: /Unassigned/i });
      await user.click(unassignedBtn);

      expect(onAssigneeChange).toHaveBeenCalledWith(null);
    });

    it('shows "No users found" when search yields no results', async () => {
      const user = userEvent.setup();

      render(
        <AssigneeSelector assigneeId={null} users={USERS} onAssigneeChange={vi.fn()} />
      );

      const trigger = screen.getByRole('button');
      await user.click(trigger);

      const searchInput = await screen.findByPlaceholderText('Search...');
      await user.type(searchInput, 'zzznomatch');

      expect(await screen.findByText('No users found')).toBeInTheDocument();
    });
  });
});
