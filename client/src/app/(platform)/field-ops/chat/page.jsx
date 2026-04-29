import { FieldOpsChatShell } from '@/modules/field-ops/components/chat/field-ops-chat-shell';
import { FieldOpsChatSidebar } from '@/modules/field-ops/components/chat/field-ops-chat-sidebar';
import { FieldOpsChatEmpty } from '@/modules/field-ops/components/chat/field-ops-chat-empty';

export default function FieldOpsChatPage() {
  return (
    <FieldOpsChatShell sidebar={<FieldOpsChatSidebar />}>
      <FieldOpsChatEmpty />
    </FieldOpsChatShell>
  );
}
