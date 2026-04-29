import { ChatShell } from '@/modules/chat/components/chat-shell';
import { ChatSidebar } from '@/modules/chat/components/chat-sidebar';
import { ChatEmpty } from '@/modules/chat/components/chat-empty';

export default function FieldOpsChatPage() {
  return (
    <div className="-m-4 sm:-m-6 h-[calc(100%+2rem)] sm:h-[calc(100%+3rem)]">
      <ChatShell sidebar={<ChatSidebar />}>
        <ChatEmpty />
      </ChatShell>
    </div>
  );
}
