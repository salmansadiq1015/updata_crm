'use client';

import { useState, useCallback } from 'react';
import { useAiChat } from '../../hooks/use-ai-chat';
import { AiChatSidebar } from './ai-chat-sidebar';
import { AiChatMain } from './ai-chat-main';
import { generateId } from '@/lib/utils/ids';

function newThreadId() {
  return generateId();
}

function replacePath(path) {
  if (typeof window === 'undefined' || window.location.pathname === path) return;
  window.history.replaceState(null, '', path);
}

export function AiChatLayout({ initialThreadId } = {}) {
  // selectedThreadId = thread currently shown in main area
  const [selectedThreadId, setSelectedThreadId] = useState(initialThreadId ?? null);
  // currentThreadId = thread new messages are sent into (may differ from selected while browsing history)
  const [currentThreadId, setCurrentThreadId] = useState(initialThreadId ?? newThreadId());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleThreadSelected = useCallback((id) => {
    setSelectedThreadId((current) => (current === id ? current : id));
    setCurrentThreadId((current) => (current === id ? current : id));
    replacePath(`/ai/${id}`);
  }, []);

  const handleNewChat = useCallback(() => {
    const id = newThreadId();
    setSelectedThreadId(null);
    setCurrentThreadId(id);
    replacePath('/ai');
  }, []);

  const handleThreadDeleted = useCallback(() => {
    const id = newThreadId();
    setSelectedThreadId(null);
    setCurrentThreadId(id);
    replacePath('/ai');
  }, []);

  const chat = useAiChat({
    selectedThreadId,
    currentThreadId,
    onThreadSelected: handleThreadSelected,
    onThreadDeleted: handleThreadDeleted,
  });

  return (
    <div className="flex h-full bg-background overflow-hidden">
      <AiChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        selectedThreadId={selectedThreadId}
        onSelectThread={handleThreadSelected}
        onNewChat={handleNewChat}
        threads={chat.threads}
        isLoadingHistory={chat.isLoadingHistory}
        hasMore={chat.hasMore}
        hasPrev={chat.hasPrev}
        nextPage={chat.nextPage}
        prevPage={chat.prevPage}
        onArchiveThread={chat.archiveThread}
        onDeleteThread={chat.deleteThread}
      />
      <AiChatMain
        selectedThreadId={selectedThreadId}
        onNewChat={handleNewChat}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        threads={chat.threads}
        threadRuns={chat.threadRuns}
        latestRun={chat.latestRun}
        isLoadingThread={chat.isLoadingThread}
        dispatch={chat.dispatch}
        isDispatching={chat.isDispatching}
        pendingRuns={chat.pendingRuns}
        confirm={chat.confirm}
        isConfirming={chat.isConfirming}
        recorder={chat.recorder}
        voiceSession={chat.voiceSession}
      />
    </div>
  );
}
