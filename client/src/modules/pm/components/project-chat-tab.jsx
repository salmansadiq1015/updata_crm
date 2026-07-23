'use client';

import { MessagesSquare } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useProjectChatRoom } from '@/modules/chat/hooks/use-chat-rooms';
import { ChatPanel } from '@/modules/chat/components/chat-panel';
import { EmptyState } from '@/shared/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

export function ProjectChatTab({ projectId }) {
  const { t } = useLanguage();
  const { data: room, isLoading, isError } = useProjectChatRoom(projectId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  if (isError || !room) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title={t('pm.chatTab', 'Chat')}
        description={t('pm.chatNoAccess', 'Nur Projektbeteiligte können diesen Chat sehen.')}
      />
    );
  }

  return (
    <div className="h-[calc(100vh-14rem)] min-h-[420px] overflow-hidden rounded-xl border border-border bg-card shadow-theme-sm">
      <ChatPanel roomId={room._id} variant="embedded" />
    </div>
  );
}
