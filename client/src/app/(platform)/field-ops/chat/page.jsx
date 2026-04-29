import { ChatShell } from '@/modules/chat/components/chat-shell';
import { ChatSidebar } from '@/modules/chat/components/chat-sidebar';
import { ChatEmpty } from '@/modules/chat/components/chat-empty';

export default function FieldOpsChatPage() {
  return (
    <ChatShell sidebar={<ChatSidebar />}>
      <ChatEmpty />
    </ChatShell>
  );
}
