'use client';

import { useState } from 'react';
import { ChevronDown, UserRound, Users, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

type WorkspaceUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

type AssigneeSelectorProps = {
  assigneeIds: string[];
  users: WorkspaceUser[];
  onAssigneeChange: (ids: string[]) => void;
  size?: 'sm' | 'default';
  disabled?: boolean;
};

function initials(user: WorkspaceUser) {
  return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
}

function Avatar({ user, size = 'sm' }: { user: WorkspaceUser; size?: 'sm' | 'default' }) {
  const dim = size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]';
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={`${user.firstName} ${user.lastName}`}
        className={cn('rounded-full object-cover shrink-0', dim)}
      />
    );
  }
  return (
    <span className={cn('rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0', dim)}>
      {initials(user)}
    </span>
  );
}

export function AssigneeSelector({ assigneeIds, users, onAssigneeChange, size = 'sm', disabled = false }: AssigneeSelectorProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedSet = new Set(assigneeIds ?? []);
  const assignedUsers = users.filter((u) => selectedSet.has(u.id));
  const filtered = users.filter((u) =>
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const isSmall = size === 'sm';

  const toggleUser = (userId: string) => {
    const next = selectedSet.has(userId)
      ? assigneeIds.filter((id) => id !== userId)
      : [...assigneeIds, userId];
    onAssigneeChange(next);
  };

  const clearAll = () => {
    onAssigneeChange([]);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={(next) => { if (!disabled) setOpen(next); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md border border-border bg-background font-normal',
            'hover:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background',
            isSmall ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-sm',
            assignedUsers.length === 0 && 'text-muted-foreground border-dashed',
          )}
        >
          {assignedUsers.length > 0 ? (
            <>
              <div className="flex -space-x-1.5 shrink-0">
                {assignedUsers.slice(0, 3).map((u) => (
                  <Avatar key={u.id} user={u} size={size} />
                ))}
              </div>
              <span className="flex-1 truncate text-left font-medium">
                {assignedUsers.length === 1
                  ? `${assignedUsers[0].firstName} ${assignedUsers[0].lastName}`
                  : `${assignedUsers.length} ${t('tasks.assignees', 'Zugewiesene')}`}
              </span>
            </>
          ) : (
            <>
              <UserRound className={cn('shrink-0', isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
              <span className="flex-1">{t('tasks.assign', 'Assign')}</span>
            </>
          )}
          <ChevronDown className={cn('ml-auto shrink-0 opacity-40', isSmall ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0 shadow-lg" align="start">
        <div className="px-2 pt-2 pb-1.5 border-b">
          <Input
            placeholder={t('tasks.searchMembers', 'Search members...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
            autoFocus
          />
        </div>

        <div className="max-h-56 overflow-y-auto py-1">
          {/* Unassign all option */}
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-accent rounded-sm mx-0',
              assignedUsers.length === 0 && 'bg-accent/70',
            )}
            onClick={clearAll}
          >
            <span className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center shrink-0">
              <UserRound className="h-3 w-3 text-muted-foreground/60" />
            </span>
            <span className="text-xs text-muted-foreground">{t('tasks.unassigned', 'Unassigned')}</span>
            {assignedUsers.length === 0 && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </button>

          {/* User list — multi-select */}
          {filtered.map((user) => {
            const isSelected = selectedSet.has(user.id);
            return (
              <button
                type="button"
                key={user.id}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-accent',
                  isSelected && 'bg-accent/70',
                )}
                onClick={() => toggleUser(user.id)}
              >
                <Avatar user={user} size="default" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium leading-tight">
                    {user.firstName} {user.lastName}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {user.email}
                  </div>
                </div>
                {isSelected && (
                  <Check className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </button>
            );
          })}

          {filtered.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">{t('tasks.noMembers', 'No members found')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
