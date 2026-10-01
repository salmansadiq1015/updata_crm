'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, PenSquare, Search, ChevronLeft, Trash2, Archive } from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { dateLocale } from '../../utils/date-locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { WORKFLOW_LABELS, AGENT_STATUSES } from '../../constants/ai-constants';

const STATUS_DOT = {
  [AGENT_STATUSES.COMPLETED]: 'bg-green-500',
  [AGENT_STATUSES.FAILED]: 'bg-red-500',
  [AGENT_STATUSES.CANCELLED]: 'bg-muted-foreground/50',
  [AGENT_STATUSES.AWAITING_CONFIRMATION]: 'bg-amber-500',
  [AGENT_STATUSES.RUNNING]: 'bg-blue-500 animate-pulse',
  [AGENT_STATUSES.PENDING]: 'bg-blue-500 animate-pulse',
};

function groupByDate(threads) {
  const today = [];
  const yesterday = [];
  const earlier = [];

  for (const thread of threads) {
    const date = new Date(thread.createdAt);
    if (isToday(date)) today.push(thread);
    else if (isYesterday(date)) yesterday.push(thread);
    else earlier.push(thread);
  }

  return { today, yesterday, earlier };
}

function ThreadItem({ thread, isActive, onSelect, onArchive, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { t, locale } = useLanguage();
  const workflowLabel = t(`ai.workflow.${thread.workflowType}`, WORKFLOW_LABELS[thread.workflowType] ?? thread.workflowType ?? t('ai.chat.run'));
  const title = typeof thread.input === 'string' && thread.input ? thread.input : workflowLabel;
  const dot = STATUS_DOT[thread.status] ?? 'bg-muted-foreground/50';
  const ago = thread.createdAt
    ? formatDistanceToNow(new Date(thread.createdAt), { addSuffix: false, locale: dateLocale(locale) })
    : '';
  const threadId = thread.threadId || thread._id;
  const truncatedTitle = `${title.slice(0, 60)}${title.length > 60 ? '...' : ''}`;

  return (
    <>
      <div
        className={cn(
          'group w-full flex items-center gap-2 px-2 py-2 text-sm transition-all rounded-md',
          'border-l-2',
          isActive
            ? 'bg-primary/10 text-primary border-primary font-medium'
            : 'border-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground',
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        >
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0 mt-0.5', dot)} />
          <span className="flex-1 truncate leading-snug text-xs">{title}</span>
          <span className="text-[10px] shrink-0 opacity-50 group-hover:opacity-0 transition-opacity">{ago}</span>
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title={t('common.archive', 'Archive')}
            onClick={(event) => { event.stopPropagation(); onArchive(threadId); }}
          >
            <Archive className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            title={t('common.delete', 'Delete')}
            onClick={(event) => { event.stopPropagation(); setConfirmDelete(true); }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('ai.chat.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('ai.chat.deleteDescription', null, { title: truncatedTitle })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { onDelete(threadId); setConfirmDelete(false); }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ThreadGroup({ label, threads, selectedThreadId, onSelect, onArchive, onDelete }) {
  if (!threads.length) return null;
  return (
    <div>
      <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {label}
      </p>
      {threads.map((thread) => {
        const threadId = thread.threadId || thread._id;
        return (
          <ThreadItem
            key={threadId}
            thread={thread}
            isActive={threadId === selectedThreadId}
            onSelect={() => onSelect(threadId)}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}

function SidebarContent({
  selectedThreadId,
  onSelectThread,
  onNewChat,
  onClose,
  onArchiveThread,
  onDeleteThread,
  isLoadingHistory,
  hasMore,
  hasPrev,
  nextPage,
  prevPage,
  search,
  setSearch,
  filtered,
  groups,
}) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold text-sm truncate">Updata</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewChat} title={t('ai.chat.newChat')}>
            <PenSquare className="h-3.5 w-3.5" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title={t('ai.chat.closeSidebar')}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={t('ai.chat.searchChats')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 px-1">
        {isLoadingHistory ? (
          <div className="flex flex-col gap-1 px-2 pt-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <>
            <ThreadGroup label={t('common.today')} threads={groups.today} selectedThreadId={selectedThreadId} onSelect={onSelectThread} onArchive={onArchiveThread} onDelete={onDeleteThread} />
            <ThreadGroup label={t('common.yesterday')} threads={groups.yesterday} selectedThreadId={selectedThreadId} onSelect={onSelectThread} onArchive={onArchiveThread} onDelete={onDeleteThread} />
            <ThreadGroup label={t('common.earlier')} threads={groups.earlier} selectedThreadId={selectedThreadId} onSelect={onSelectThread} onArchive={onArchiveThread} onDelete={onDeleteThread} />
            {!filtered.length && (
              <p className="text-xs text-muted-foreground text-center py-10 px-3">
                {search ? t('ai.chat.noMatches') : t('ai.chat.empty')}
              </p>
            )}
          </>
        )}
      </div>

      {(hasPrev || hasMore) && (
        <div className="flex gap-1 px-3 py-2 border-t border-border shrink-0">
          {hasPrev && (
            <Button variant="ghost" size="sm" className="flex-1 text-xs h-7" onClick={prevPage}>
              {t('common.previous')}
            </Button>
          )}
          {hasMore && (
            <Button variant="ghost" size="sm" className="flex-1 text-xs h-7" onClick={nextPage}>
              {t('common.more')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function AiChatSidebar({
  open,
  onToggle,
  selectedThreadId,
  onSelectThread,
  onNewChat,
  onArchiveThread,
  onDeleteThread,
  threads = [],
  isLoadingHistory,
  hasMore,
  hasPrev,
  nextPage,
  prevPage,
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return threads;
    const query = search.toLowerCase();
    return threads.filter((thread) => {
      const text = typeof thread.input === 'string' ? thread.input.toLowerCase() : '';
      const label = (WORKFLOW_LABELS[thread.workflowType] ?? '').toLowerCase();
      return text.includes(query) || label.includes(query);
    });
  }, [threads, search]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const sharedProps = {
    selectedThreadId,
    onSelectThread,
    onNewChat,
    onArchiveThread,
    onDeleteThread,
    isLoadingHistory,
    hasMore,
    hasPrev,
    nextPage,
    prevPage,
    search,
    setSearch,
    filtered,
    groups,
  };

  return (
    <>
      <motion.aside
        initial={{ width: open ? 260 : 0 }}
        animate={{ width: open ? 260 : 0 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className="hidden md:block h-full bg-card border-r border-border overflow-hidden shrink-0"
      >
        <div className="w-[260px] h-full">
          <SidebarContent {...sharedProps} onClose={onToggle} />
        </div>
      </motion.aside>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="md:hidden fixed inset-0 z-50 flex"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onToggle} />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="relative z-10 w-[260px] h-full bg-card border-r border-border shadow-2xl"
            >
              <SidebarContent
                {...sharedProps}
                onSelectThread={(id) => { onSelectThread(id); onToggle(); }}
                onClose={onToggle}
              />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
