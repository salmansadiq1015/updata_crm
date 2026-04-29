'use client';
import { use } from 'react';
import { ChatShell } from '@/modules/chat/components/chat-shell';
import { ChatSidebar } from '@/modules/chat/components/chat-sidebar';
import { ChatPanel } from '@/modules/chat/components/chat-panel';

export default function FieldOpsChatRoomPage({ params }) {
  const { roomId } = use(params);
  return (
    <div className="-m-4 sm:-m-6 h-[calc(100%+2rem)] sm:h-[calc(100%+3rem)]">
      <ChatShell sidebar={<ChatSidebar activeRoomId={roomId} />}>
        <ChatPanel roomId={roomId} />
      </ChatShell>
    </div>
  );
}
