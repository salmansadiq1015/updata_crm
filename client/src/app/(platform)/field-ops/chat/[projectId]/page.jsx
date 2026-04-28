'use client';
import { use } from 'react';
import { FieldOpsChatPanel } from '@/modules/field-ops/components/chat/field-ops-chat-panel';
export default function FieldOpsChatPage({ params }) {
  const { projectId } = use(params);
  return <FieldOpsChatPanel projectId={projectId} />;
}
