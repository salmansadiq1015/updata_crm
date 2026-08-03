'use client';

import { useQuery } from '@tanstack/react-query';
import { MessagesSquare, FolderKanban, Loader2 } from 'lucide-react';
import { taskService } from '../services/task-service';
import { ChatPanel } from '@/modules/chat/components/chat-panel';
import { useLanguage } from '@/lib/i18n/language-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Chat for a task. A task linked to a project opens the project chat; any other
 * task opens its own dedicated room. The room (and membership) is resolved/
 * created server-side via GET /tasks/:id/chat.
 */
export function TaskChatDialog({ task, open, onOpenChange }) {
  const { t } = useLanguage();
  const taskId = task?._id || task?.id;

  const { data: chat, isLoading } = useQuery({
    queryKey: ['tasks', 'chat', taskId],
    queryFn: () => taskService.resolveChat(taskId),
    enabled: open && !!taskId,
    staleTime: 60_000,
  });

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
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {isLoading || !chat?.roomId ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <ChatPanel roomId={chat.roomId} variant="embedded" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
