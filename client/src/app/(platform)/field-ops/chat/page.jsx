'use client';
import { useSearchParams } from 'next/navigation';
import { ChatShell } from '@/modules/chat/components/chat-shell';
import { ChatSidebar } from '@/modules/chat/components/chat-sidebar';
import { ChatPanel } from '@/modules/chat/components/chat-panel';
import { ChatEmpty } from '@/modules/chat/components/chat-empty';

export default function FieldOpsChatPage() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get('chatId');

  return (
    <div className="h-full">
      <ChatShell sidebar={<ChatSidebar activeRoomId={chatId} />}>
        {chatId ? <ChatPanel roomId={chatId} /> : <ChatEmpty />}
      </ChatShell>
    </div>
  );
}
