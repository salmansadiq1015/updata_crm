'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AiChatLayout } from '@/modules/ai/components/chat/ai-chat-layout';

function AiPageInner() {
  const searchParams = useSearchParams();
  const chatRoomId = searchParams.get('chatRoomId');
  const intent = searchParams.get('intent');

  const initialContext = chatRoomId ? { chatRoomId } : null;
  const initialPrompt = chatRoomId && intent === 'summary'
    ? 'Fasse diesen Chat zusammen.'
    : null;

  return <AiChatLayout initialContext={initialContext} initialPrompt={initialPrompt} />;
}

export default function AiPage() {
  return (
    <Suspense fallback={null}>
      <AiPageInner />
    </Suspense>
  );
}
