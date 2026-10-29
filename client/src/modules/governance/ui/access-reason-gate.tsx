'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { useCreateAccessGrant } from '../hooks/use-governance';

const MIN_REASON = 5;

/**
 * Break-glass prompt: shown when the server answers 428 ACCESS_REASON_REQUIRED
 * (team mode, a lead the viewer does not own). The reason is audited and opens
 * a short-lived grant; `onGranted` refetches the lead.
 */
export function AccessReasonGate({ leadId, onGranted, onCancel }: { leadId: string; onGranted?: () => void; onCancel?: () => void }) {
  const { t } = useLanguage();
  const [reason, setReason] = useState('');
  const grant = useCreateAccessGrant();
  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON;

  const submit = async () => {
    if (tooShort) return;
    try {
      await grant.mutateAsync({ leadId, reason: trimmed });
      onGranted?.();
    } catch {
      // Error is shown inline below.
    }
  };

  return (
    <div className="m-4 space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5" role="region" aria-labelledby="access-reason-title">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="size-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <h3 id="access-reason-title" className="text-sm font-semibold text-foreground">{t('governance.gate.title', 'This lead belongs to someone else')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('governance.gate.body', 'Opening it is recorded in the access log together with your reason. Access stays open for a short time.')}
          </p>
        </div>
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
      >
        <label htmlFor="access-reason" className="text-xs font-medium text-foreground">{t('governance.gate.reasonLabel', 'Reason for access')}</label>
        <Textarea
          className=""
          id="access-reason"
          value={reason}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value)}
          placeholder={t('governance.gate.reasonPlaceholder', 'e.g. Reviewing a call for coaching')}
          maxLength={500}
          rows={3}
          aria-invalid={Boolean(trimmed) && tooShort}
          aria-describedby="access-reason-hint"
        />
        <p id="access-reason-hint" className="text-[11px] text-muted-foreground">
          {t('governance.gate.reasonHint', 'At least {min} characters.', { min: MIN_REASON })}
        </p>
        {grant.isError && (
          <p role="alert" className="text-xs text-destructive">{(grant.error as { message?: string })?.message || t('governance.gate.failed', 'Access could not be granted.')}</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel', 'Cancel')}</Button>}
          <Button type="submit" size="sm" disabled={tooShort || grant.isPending}>
            {grant.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {t('governance.gate.submit', 'Open with this reason')}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default AccessReasonGate;
