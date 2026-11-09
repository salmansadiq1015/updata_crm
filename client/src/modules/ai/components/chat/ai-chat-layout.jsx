'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAiChat } from '../../hooks/use-ai-chat';
import { AiChatSidebar } from './ai-chat-sidebar';
import { AiChatMain } from './ai-chat-main';
import { generateId } from '@/lib/utils/ids';
import { buildAiRouteContext } from '../../utils/ai-route-context';
import { useLiveVoiceStore } from '../../voice-live/live-voice-store';

function newThreadId() {
  return generateId();
}

function replacePath(path) {
  if (typeof window === 'undefined' || window.location.pathname === path) return;
  window.history.replaceState(null, '', path);
}

export function AiChatLayout({ initialThreadId, initialContext, initialPrompt } = {}) {
  const pathname = usePathname();
  // selectedThreadId = thread currently shown in main area
  const [selectedThreadId, setSelectedThreadId] = useState(initialThreadId ?? null);
  // currentThreadId = thread new messages are sent into (may differ from selected while browsing history)
  const [currentThreadId, setCurrentThreadId] = useState(initialThreadId ?? newThreadId());
  // Sur un écran étroit la liste des conversations n'est pas une colonne mais
  // un panneau qui recouvre tout : ouverte d'emblée, elle cache exactement ce
  // qu'on vient lire. Le chat n'est monté qu'après la porte d'authentification,
  // donc côté navigateur uniquement — lire la largeur ici ne risque aucun
  // désaccord avec le rendu du serveur.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches,
  );
  const routeContext = useMemo(() => {
    const base = buildAiRouteContext(pathname);
    if (!initialContext) return base;
    return { ...(base || {}), ...initialContext };
  }, [pathname, initialContext]);

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
    context: routeContext,
    onThreadSelected: handleThreadSelected,
    onThreadDeleted: handleThreadDeleted,
  });

  // After a live voice conversation that did work, show its thread here.
  useEffect(() => useLiveVoiceStore.subscribe((state, prev) => {
    const ended = state.lastEnded;
    if (ended && ended !== prev.lastEnded && ended.threadId) handleThreadSelected(ended.threadId);
  }), [handleThreadSelected]);

  // Deep links like /ai?chatRoomId=…&intent=summary fire their prompt once.
  const initialPromptSent = useRef(false);
  const { dispatch } = chat;
  useEffect(() => {
    if (!initialPrompt || initialPromptSent.current) return;
    initialPromptSent.current = true;
    dispatch(initialPrompt);
  }, [initialPrompt, dispatch]);

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
        onThreadSelected={handleThreadSelected}
      />
    </div>
  );
}
