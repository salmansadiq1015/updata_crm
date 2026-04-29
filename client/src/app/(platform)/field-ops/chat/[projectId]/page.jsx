import { use } from 'react';
import { FieldOpsChatShell } from '@/modules/field-ops/components/chat/field-ops-chat-shell';
import { FieldOpsChatSidebar } from '@/modules/field-ops/components/chat/field-ops-chat-sidebar';
import { FieldOpsChatPanel } from '@/modules/field-ops/components/chat/field-ops-chat-panel';

export default function FieldOpsChatProjectPage({ params }) {
  const { projectId } = use(params);

  return (
    <FieldOpsChatShell sidebar={<FieldOpsChatSidebar activeProjectId={projectId} />}>
      <FieldOpsChatPanel projectId={projectId} />
    </FieldOpsChatShell>
  );
}
