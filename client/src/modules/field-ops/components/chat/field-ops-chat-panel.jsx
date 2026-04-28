'use client';

import { useEffect, useRef } from 'react';
import { useChatMessages, useChatMutations } from '@/modules/mobile/hooks/use-chat';
import { FieldOpsChatMessage } from './field-ops-chat-message';
import { FieldOpsChatInput } from './field-ops-chat-input';
import { PageHeader } from '@/shared/components/page-header';
import { useLanguage } from '@/lib/i18n/language-context';

export function FieldOpsChatPanel({ projectId }) {
  const { t } = useLanguage();
  const bottomRef = useRef(null);

  const { data: messages = [], isLoading } = useChatMessages(projectId);
  const { sendMessage } = useChatMutations(projectId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="px-6 py-4">
        <PageHeader
          title={t('fieldOps.chat.title', 'Project Chat')}
          description={`Project ${projectId}`}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-2">
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map((i) => (
              <div key={i} className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-muted animate-pulse" />
                <div className="h-10 w-48 rounded-2xl bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t('fieldOps.chat.empty', 'No messages yet.')}
          </div>
        ) : (
          messages.map((msg) => <FieldOpsChatMessage key={msg.id || msg._id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>
      <FieldOpsChatInput
        onSend={(data) => sendMessage.mutate(data)}
        isLoading={sendMessage.isPending}
      />
    </div>
  );
}
