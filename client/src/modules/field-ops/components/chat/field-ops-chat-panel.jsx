'use client';

import { useCallback, useMemo } from 'react';
import { useChatMessages } from '@/modules/mobile/hooks/use-chat';
import { useFieldOpsChatMutations } from '@/modules/field-ops/hooks/use-field-ops-chat-mutations';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { toFieldOpsOrderItems } from '@/modules/field-ops/utils/order-option-utils';
import { useAuth } from '@/shared/hooks/use-auth';
import { FieldOpsChatHeader } from './field-ops-chat-header';
import { FieldOpsChatMessages } from './field-ops-chat-messages';
import { FieldOpsChatTypingIndicator } from './field-ops-chat-typing-indicator';
import { FieldOpsChatInput } from './field-ops-chat-input';

export function FieldOpsChatPanel({ projectId }) {
  const { user } = useAuth();
  const { data: messages = [], isLoading, typingUsers = [] } = useChatMessages(projectId);
  const { sendMessage } = useFieldOpsChatMutations(projectId);
  const { data: ordersResponse } = useFieldOpsOrders({});

  const orders = useMemo(() => toFieldOpsOrderItems(ordersResponse), [ordersResponse]);
  const order = useMemo(
    () => orders.find((item) => (item.projectId || item.project_id) === projectId),
    [orders, projectId],
  );

  const handleSend = useCallback(
    (payload) => {
      sendMessage.mutate(payload);
    },
    [sendMessage]
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
