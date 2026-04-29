'use client';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useChatMutations } from '@/modules/chat/hooks/use-chat-mutations';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, X } from 'lucide-react';

function Checkbox({ checked, onCheckedChange }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`h-4 w-4 shrink-0 rounded border transition-colors flex items-center justify-center ${
        checked ? 'bg-primary border-primary' : 'border-input bg-background'
      }`}
    >
      {checked && <Check className="h-3 w-3 text-primary-foreground" />}
    </button>
  );
}
import apiClient from '@/lib/api/client';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function CreateGroupDialog({ open, onClose }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const debouncedSearch = useDebounce(searchTerm.toLowerCase().trim(), 300);

  const { createGroupRoom } = useChatMutations();

  const { data, isLoading } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => apiClient.get('/users?status=active&limit=100').then((r) => r.data?.data ?? r.data),
    enabled: open && step === 2,
    staleTime: 60_000,
  });

  const users = Array.isArray(data) ? data : [];

  const filtered = debouncedSearch
    ? users.filter((u) => {
        const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
        const email = (u.email ?? '').toLowerCase();
        return fullName.includes(debouncedSearch) || email.includes(debouncedSearch);
      })
    : users;

  function getInitials(user) {
    return `${(user.firstName ?? '')[0] ?? ''}${(user.lastName ?? '')[0] ?? ''}`.toUpperCase();
  }

  function getRoleLabel(role) {
    return typeof role === 'string' ? role : role?.name ?? '';
  }

  function getSelectedUser(id) {
    return users.find((u) => u._id === id);
  }

  function handleClose() {
    setStep(1);
    setName('');
    setDescription('');
    setSearchTerm('');
    setSelectedIds([]);
    onClose();
  }

  function handleCreate() {
    createGroupRoom.mutate(
      {
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        memberIds: selectedIds,
      },
      {
        onSuccess: (room) => {
          router.push(`/field-ops/chat/${room._id}`);
          handleClose();
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                New Group
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Group Name <span className="text-destructive">*</span>
                </label>
                <Input
                  autoFocus
                  placeholder="e.g. Field Ops Alpha"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 100))}
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Description (optional)
                </label>
                <textarea
                  className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  placeholder="What is this group about?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep(2)} disabled={!name.trim()}>
                Next →
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Add Members
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-1">
              <Input
                autoFocus
                placeholder="Search by name or email…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedIds.map((id) => {
                    const user = getSelectedUser(id);
                    if (!user) return null;
                    return (
                      <Badge key={id} variant="secondary" className="flex items-center gap-1 pr-1">
                        <span className="text-xs">
                          {user.firstName} {user.lastName}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedIds((prev) => prev.filter((i) => i !== id))}
                          className="ml-0.5 rounded-full hover:bg-accent p-0.5"
                          aria-label={`Remove ${user.firstName}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              <ScrollArea className="h-65">
                {isLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Loading users…</p>
                ) : filtered.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No users found</p>
                ) : (
                  <ul className="space-y-1 py-1 pr-3">
                    {filtered.map((user) => (
                      <li key={user._id}>
                        <label className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent">
                          <Checkbox
                            checked={selectedIds.includes(user._id)}
                            onCheckedChange={(checked) => {
                              setSelectedIds((prev) =>
                                checked
                                  ? [...prev, user._id]
                                  : prev.filter((id) => id !== user._id)
                              );
                            }}
                          />
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-none">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
                          </div>
                          {user.role && (
                            <Badge variant="secondary" className="shrink-0 capitalize text-xs">
                              {getRoleLabel(user.role)}
                            </Badge>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || createGroupRoom.isPending}
              >
                {createGroupRoom.isPending ? 'Creating…' : 'Create Group'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
