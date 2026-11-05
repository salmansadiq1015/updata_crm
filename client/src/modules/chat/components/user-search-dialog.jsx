'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useStartDm } from '../hooks/use-start-dm';
import { useChatUsers } from '../hooks/use-chat-directory';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function UserSearchDialog({ open, onClose }) {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm.toLowerCase().trim(), 300);
  const startDm = useStartDm();

  const { data, isLoading, isError, refetch } = useChatUsers({ enabled: open, search: debouncedSearch });

  const users = Array.isArray(data) ? data : [];

  const filtered = debouncedSearch
    ? users.filter((u) => {
        const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
        const email = (u.email ?? '').toLowerCase();
        return fullName.includes(debouncedSearch) || email.includes(debouncedSearch);
      })
    : users;

  async function handleSelect(user) {
    try { await startDm.mutateAsync(user._id); onClose(); } catch { /* Keep the picker open so the request can be retried. */ }
  }

  function getInitials(user) {
    return `${(user.firstName ?? '')[0] ?? ''}${(user.lastName ?? '')[0] ?? ''}`.toUpperCase();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chat.newMessage')}</DialogTitle>
          <DialogDescription className="sr-only">{t('chat.newMessageDesc')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <Input
            autoFocus
            placeholder={t('chat.searchByNameEmail')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {(isError || startDm.isError) && <p role="alert" className="text-sm text-destructive">{t('chat.workspace.loadFailed', 'Unable to open chat. Try again.')} <button type="button" onClick={() => refetch()} className="underline">{t('common.retry', 'Retry')}</button></p>}
          <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
            {isLoading ? (
              <div className="space-y-3 py-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-1">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('common.noUsers')}</p>
            ) : (
              <ul className="space-y-1 py-1">
                {filtered.map((user) => (
                  <li key={user._id}>
                    <button
                      type="button"
                      disabled={startDm.isPending}
                      onClick={() => handleSelect(user)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Avatar className="h-9 w-9">
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
                          {typeof user.role === 'string' ? user.role : (user.role?.name ?? '')}
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
