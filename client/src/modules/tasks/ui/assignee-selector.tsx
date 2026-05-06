'use client';

import { useState } from 'react';
import { ChevronDown, UserRound, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
  assigneeId: string | null;
  users: WorkspaceUser[];
  onAssigneeChange: (id: string | null) => void;
  size?: 'sm' | 'default';
};

function initials(user: WorkspaceUser) {
  return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
}

export function AssigneeSelector({ assigneeId, users, onAssigneeChange, size = 'sm' }: AssigneeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const assigned = users.find((u) => u.id === assigneeId) ?? null;
  const filtered = users.filter((u) =>
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className={cn('gap-1.5 font-normal', size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm')}
        >
          {assigned ? (
            <>
              <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-[9px] font-medium flex items-center justify-center shrink-0">
                {initials(assigned)}
              </span>
              <span className="min-w-0 flex flex-col items-start">
                <span className="truncate max-w-24 leading-tight">{assigned.firstName} {assigned.lastName}</span>
                <span className="truncate max-w-24 text-[9px] text-muted-foreground leading-tight">{assigned.email}</span>
              </span>
            </>
          ) : (
            <>
              <UserRound className="h-4 w-4" />
              <span>Assign</span>
            </>
          )}
          <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <div className="border-b p-2">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-52 overflow-auto py-1">
          <button
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent',
              !assigneeId && 'bg-accent'
            )}
            onClick={() => { onAssigneeChange(null); setOpen(false); setSearch(''); }}
          >
            <UserRound className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Unassigned</span>
            {!assigneeId && <Check className="ml-auto h-4 w-4" />}
          </button>
          {filtered.map((user) => (
            <button
              key={user.id}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent',
                user.id === assigneeId && 'bg-accent'
              )}
              onClick={() => { onAssigneeChange(user.id); setOpen(false); setSearch(''); }}
            >
              <span className="h-6 w-6 rounded-full bg-primary/20 text-primary text-[10px] font-medium flex items-center justify-center shrink-0">
                {initials(user)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium text-xs">{user.firstName} {user.lastName}</div>
                <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
              </div>
              {user.id === assigneeId && <Check className="ml-auto h-4 w-4 shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No users found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
