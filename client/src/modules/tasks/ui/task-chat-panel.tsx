'use client';

import { useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TaskNote } from '../types/task-types';
import type { WorkspaceUser } from '../hooks/use-workspace-users';

type ChatPanelProps = {
  notes: TaskNote[];
  isLoading: boolean;
  currentUserId: string | null;
  users: WorkspaceUser[];
  onCreateNote: (bodyHtml: string) => void;
  onDeleteNote: (noteId: string) => void;
  isCreating?: boolean;
};

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function UserAvatar({ user }: { user: WorkspaceUser | undefined }) {
  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : '?';
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
      {initials}
    </span>
  );
}

export function TaskChatPanel({
  notes,
  isLoading,
  currentUserId,
  users,
  onCreateNote,
  onDeleteNote,
  isCreating,
}: ChatPanelProps) {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const findUser = (id: string) => users.find((u) => u.id === id);

  const handleSend = () => {
    const body = text.trim();
    if (!body) return;
    onCreateNote(body);
    setText('');
    textareaRef.current?.focus();
  };

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('tasks.activity.title', 'Aktivität')} {notes.length > 0 && `(${notes.length})`}
      </h3>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-10 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('tasks.activity.empty', 'Noch keine Kommentare. Schreiben Sie den ersten.')}</p>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => {
            const author = findUser(note.authorId);
            const isOwn = note.authorId === currentUserId;
            return (
              <div key={note.id} className="group flex gap-3">
                <UserAvatar user={author} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold">
                      {author ? `${author.firstName} ${author.lastName}` : t('common.unknown', 'Unbekannt')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(note.createdAt)}</span>
                    {note.isEdited && (
                      <span className="text-[10px] text-muted-foreground italic">(edited)</span>
                    )}
                  </div>
                  <div
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: note.bodyHtml }}
                  />
                </div>
                {isOwn && (
                  <button
                    type="button"
                    className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onDeleteNote(note.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Comment input */}
      <div className="mt-4 flex gap-3">
        <UserAvatar user={findUser(currentUserId ?? '')} />
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend();
            }}
            placeholder={t('tasks.activity.placeholder', 'Kommentar schreiben… (Ctrl+Enter zum Senden)')}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/50"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={!text.trim() || isCreating}
              onClick={handleSend}
            >
              <Send className="h-3 w-3" />
              {isCreating ? t('tasks.activity.sending', 'Senden…') : t('tasks.activity.send', 'Senden')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
