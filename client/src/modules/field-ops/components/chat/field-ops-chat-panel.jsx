'use client';

import { useCallback } from 'react';
import { useChatMessages } from '@/modules/mobile/hooks/use-chat';
import { useFieldOpsChatMutations } from '@/modules/field-ops/hooks/use-field-ops-chat-mutations';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useAuth } from '@/shared/hooks/use-auth';
import { FieldOpsChatHeader } from './field-ops-chat-header';
import { FieldOpsChatMessages } from './field-ops-chat-messages';
import { FieldOpsChatTypingIndicator } from './field-ops-chat-typing-indicator';
import { FieldOpsChatInput } from './field-ops-chat-input';

export function FieldOpsChatPanel({ projectId }) {
  const { user } = useAuth();
  const { data: messages = [], isLoading, typingUsers = [] } = useChatMessages(projectId);
  const { sendMessage } = useFieldOpsChatMutations(projectId);
  const { data: orders = [] } = useFieldOpsOrders({});

  const order = orders.find(
    (o) => (o.projectId || o.project_id) === projectId
  );

  const handleSend = useCallback(
    (payload) => {
      sendMessage.mutate(payload);
    },
    [sendMessage.mutate]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FieldOpsChatHeader order={order} />
      <FieldOpsChatMessages
        messages={messages}
        isLoading={isLoading}
        currentUserId={user?._id}
      />
      <FieldOpsChatTypingIndicator typingUsers={typingUsers} />
      <FieldOpsChatInput
        onSend={handleSend}
        isLoading={sendMessage.isPending}
        projectId={projectId}
      />
    </div>
  );
}
