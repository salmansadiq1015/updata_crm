'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAiChat } from '../../hooks/use-ai-chat';
import { AiChatSidebar } from './ai-chat-sidebar';
import { AiChatMain } from './ai-chat-main';
import { generateId } from '@/lib/utils/ids';
import { buildAiRouteContext } from '../../utils/ai-route-context';
import { useLiveVoiceStore } from '../../voice-live/live-voice-store';
import { MessagesSquare, Plus, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { BandChip, PageBand, heroButton } from '@/shared/components/page-hero';

function newThreadId() {
  return generateId();
}

function replacePath(path) {
  if (typeof window === 'undefined' || window.location.pathname === path) return;
  window.history.replaceState(null, '', path);
}

export function AiChatLayout({ initialThreadId, initialContext, initialPrompt } = {}) {
  const pathname = usePathname();
  const { t } = useLanguage();
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
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
      <div className={selectedThreadId ? 'hidden md:block' : undefined}>
        <PageBand
          id="ai-assistant-title"
          art="/hero/ai"
          icon={Sparkles}
          eyebrow={t('aiHero.eyebrow', 'AI assistant')}
          title={t('aiHero.title', 'Ask, plan and act — in plain language.')}
          subtitle={t('aiHero.subtitle', 'Your assistant reads the CRM, drafts the work and asks before it changes anything.')}
          chips={<BandChip icon={MessagesSquare} value={chat.threads?.length ?? 0} label={t('aiHero.threads', 'recent conversations')} />}
          actions={<button type="button" className={heroButton.primary} onClick={handleNewChat}><Plus aria-hidden="true" />{t('aiHero.new', 'New conversation')}</button>}
        />
      </div>
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background shadow-[0_8px_30px_-18px_rgba(15,23,42,0.35)]">
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
    </div>
  );
}
