'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/language-context';
import { WORKFLOW_LABELS } from '../../constants/ai-constants';

/** Dates arrive as ISO strings; the office reads Swiss ones. */
function display(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('de-CH', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    }
  }
  return String(value ?? '');
}

/**
 * What the agent is about to do, and the chance to correct it first.
 *
 * Approval used to be yes or no, so a proposal with one wrong word had to be
 * refused and dictated again. The fields the agent filled in are shown as they
 * will be written, and editing one sends it back as a correction — kept beside
 * the original on the run, never silently replacing it.
 */
export function AiChatConfirmation({ run, onConfirm, onCancel, isConfirming }) {
  const { t } = useLanguage();
  const [edits, setEdits] = useState({});
  const [editing, setEditing] = useState(false);

  const confirmation = run?.output?.confirmation || null;
  const proposal = useMemo(() => confirmation?.proposal || [], [confirmation]);

  const changed = useMemo(
    () => Object.fromEntries(
      Object.entries(edits).filter(([field, value]) => {
        const original = proposal.find((item) => item.field === field);
        return value !== undefined && String(value).trim() && String(value) !== String(original?.value ?? '');
      }),
    ),
    [edits, proposal],
  );

  return (
    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {t('ai.confirm.title', 'Freigabe erforderlich')}
        </p>
      </div>

      <div className="text-sm">
        <p className="text-xs text-muted-foreground mb-1">
          {t('ai.confirm.wantsToPerform', 'Der Assistent möchte Folgendes tun:')}
        </p>
        <p className="font-medium">
          {confirmation?.label
            || WORKFLOW_LABELS[run?.workflowType]
            || run?.workflowType
            || t('ai.confirm.fallbackAction', 'KI-Aktion')}
        </p>
        {confirmation?.effect ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{confirmation.effect}</p>
        ) : null}

        {proposal.length ? (
          <dl className="mt-3 flex flex-col gap-1.5 rounded-lg border bg-background/60 p-2.5">
            {proposal.map((item) => (
              <div key={item.field} className="grid grid-cols-[8rem_1fr] items-center gap-2">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="text-sm">
                  {editing ? (
                    <Input
                      className="h-8 text-sm"
                      defaultValue={display(item.value)}
                      aria-label={item.label}
                      onChange={(event) => setEdits((current) => ({ ...current, [item.field]: event.target.value }))}
                    />
                  ) : (
                    <span className="font-medium break-words">{display(item.value)}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        {proposal.length && !editing ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={isConfirming}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            {t('ai.confirm.correct', 'Korrigieren')}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isConfirming}>
          {t('common.cancel', 'Abbrechen')}
        </Button>
        <Button size="sm" onClick={() => onConfirm(changed)} disabled={isConfirming}>
          {isConfirming
            ? t('ai.confirm.confirming', 'Wird ausgeführt…')
            : Object.keys(changed).length
              ? t('ai.confirm.confirmCorrected', 'Korrigiert freigeben')
              : t('ai.confirm.confirm', 'Freigeben')}
        </Button>
      </div>
    </div>
  );
}
