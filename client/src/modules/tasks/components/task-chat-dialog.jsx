'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare, FolderKanban, Loader2, RefreshCw } from 'lucide-react';
import { taskService } from '../services/task-service';
import { ChatPanel } from '@/modules/chat/components/chat-panel';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/query/keys';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Chat for a task. A task linked to a project opens the project chat; any other
 * task opens its own dedicated room. The room (and membership) is resolved/
 * created server-side via GET /tasks/:id/chat.
 */
export function TaskChatDialog({ task, open, onOpenChange }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const taskId = task?._id || task?.id;

  const { data: chat, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['tasks', 'chat', taskId],
    queryFn: async ({ signal }) => {
      const result = await taskService.resolveChat(taskId, { signal });
      if (!result?.roomId) throw new Error('Chat room was not returned');
      // The resolver already loads this room. Reuse it rather than fetching it again.
      if (result.room?._id) queryClient.setQueryData(queryKeys.chat.room(result.roomId), result.room);
      return result;
    },
    retry: false,
    enabled: open && !!taskId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open || !taskId) return;
    return () => { queryClient.cancelQueries({ queryKey: ['tasks', 'chat', taskId], exact: true }); };
  }, [open, taskId, queryClient]);

  const isProject = chat?.roomType === 'PROJECT';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[720px] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isProject ? <FolderKanban className="h-4 w-4 text-violet-500" /> : <MessagesSquare className="h-4 w-4 text-primary" />}
            <span className="truncate">{task?.title || t('tasks.col.chat', 'Chat')}</span>
            {isProject && (
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                {t('tasks.chatProject', 'Projekt-Chat')}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('tasks.col.chat', 'Chat')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {isError || !taskId ? (
            <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-muted-foreground">{t('chat.workspace.loadFailed', 'Unable to load this conversation.')}</p>
              {taskId && <Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className="size-4" />{t('common.retry', 'Retry')}</Button>}
            </div>
          ) : isPending ? (
            <div role="status" aria-label={t('common.loading', 'Loading…')} className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />{t('common.loading', 'Loading…')}
            </div>
          ) : (
            <ChatPanel key={chat.roomId} roomId={chat.roomId} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
