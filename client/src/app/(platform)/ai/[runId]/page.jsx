'use client';

import { use } from 'react';
import { AiChatLayout } from '@/modules/ai/components/chat/ai-chat-layout';

export default function AiRunPage({ params }) {
  const { runId } = use(params);
  return <AiChatLayout initialThreadId={runId} />;
}
