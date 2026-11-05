'use client';

import type { ChangeEvent, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

type TaskQuickAddProps = {
  /** Called with the trimmed title. The field stays open and focused after. */
  onCreate: (title: string) => void | Promise<unknown>;
  /** Trigger label, e.g. "Hinzufügen" / "Aufgabe hinzufügen". */
  label: string;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  inputClassName?: string;
  /** Render the trigger as a full-width row (list view) instead of a button. */
  asRow?: boolean;
};

/**
 * Microsoft-To-Do-style quick capture (client feedback, module Aufgaben):
 * click «Hinzufügen» FIRST, then type — Enter creates the task and keeps the
 * field open and focused so several tasks can be captured in a row. Escape
 * closes; blurring an empty field closes; an empty Enter creates nothing.
 */
export function TaskQuickAdd({
  onCreate,
  label,
  placeholder,
  className,
  triggerClassName,
  inputClassName,
  asRow = false,
}: TaskQuickAddProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setTitle('');
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onCreate(trimmed);
      setTitle('');
    } catch {
      // The mutation reports the error; preserve the draft so it can be retried.
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape' && !submittingRef.current) {
      event.preventDefault();
      close();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          asRow
            ? 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground'
            : 'inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90',
          triggerClassName,
        )}
        aria-label={label}
      >
        <Plus className="h-4 w-4 shrink-0" />
        {label}
      </button>
    );
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-2', asRow && 'w-full', className)}>
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Input
        ref={inputRef}
        type="text"
        value={title}
        readOnly={isSubmitting}
        aria-busy={isSubmitting}
        maxLength={500}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => { if (!title.trim()) close(); }}
        placeholder={placeholder ?? t('tasks.quickAddPlaceholder', 'Aufgabentitel eingeben — Enter erstellt')}
        className={cn('h-8 min-w-0 flex-1 rounded-md border-border bg-background text-sm', inputClassName)}
        aria-label={label}
      />
    </div>
  );
}
