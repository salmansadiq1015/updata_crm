'use client';
import { use } from 'react';
import { ChatShell } from '@/modules/chat/components/chat-shell';
import { ChatSidebar } from '@/modules/chat/components/chat-sidebar';
import { ChatPanel } from '@/modules/chat/components/chat-panel';

export default function FieldOpsChatRoomPage({ params }) {
  const { roomId } = use(params);
  return (
    <ChatShell sidebar={<ChatSidebar activeRoomId={roomId} />}>
      <ChatPanel roomId={roomId} />
    </ChatShell>
  );
}
