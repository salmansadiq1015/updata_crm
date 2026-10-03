'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { ConfirmDialog, useLanguage } from './lead-ui-kit';

type DiscardGuard = {
  /** Feed this from the form's dirty state. */
  setDirty: (dirty: boolean) => void;
  /**
   * Runs `action` straight away when nothing is unsaved; otherwise asks first
   * and runs it only if the person agrees to throw the edits away.
   */
  guard: (action: () => void) => void;
  /** Render once, anywhere in the tree. */
  dialog: ReactNode;
};

/**
 * Protects half-typed edits from the quick ways out of a form: Escape, a click
 * on the drawer overlay, stepping to another lead.
 */
export function useDiscardGuard(): DiscardGuard {
  const { t } = useLanguage();
  const [dirty, setDirty] = useState(false);
  // Held as `{ run }` because a bare function in state would be *called* by the setter.
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  const guard = useCallback(
    (action: () => void) => {
      if (dirty) setPending({ run: action });
      else action();
    },
    [dirty],
  );

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      title={t('leads.discard.title', 'Discard changes?')}
      description={t('leads.discard.description', 'Your edits have not been saved and will be lost.')}
      confirmText={t('leads.discard.confirm', 'Discard')}
      cancelText={t('leads.discard.keepEditing', 'Keep editing')}
      onConfirm={() => {
        const action = pending;
        setPending(null);
        setDirty(false);
        action?.run();
      }}
    />
  );

  return { setDirty, guard, dialog };
}
