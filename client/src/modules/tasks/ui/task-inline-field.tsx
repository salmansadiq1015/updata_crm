'use client';

import type { ChangeEvent, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

type TaskInlineFieldProps = {
  value: string;
  ariaLabel: string;
  className?: string;
  onCommit: (value: string) => void;
};

export function TaskInlineField({ value, ariaLabel, className, onCommit }: TaskInlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <Input
        type="text"
        ref={inputRef}
        value={draft}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
        className="h-7 rounded-md border-primary/40 bg-card px-2 text-sm"
      />
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      aria-label={ariaLabel}
    >
      {value}
    </button>
  );
}
