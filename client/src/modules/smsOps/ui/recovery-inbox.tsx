'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Search } from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { leadApi } from '@/modules/leads/services/lead-api';
import { LtrText } from '@/modules/leads/ui/ltr-text';
import { useRecoveryCounts, useRecoveryItems, useSmsOpsMutations } from '../hooks/use-sms-ops';
import {
  CONFIRM_ACTIONS, RECOVERY_ACTION_FALLBACK, RECOVERY_TYPE_FALLBACK, formatDateTime, relativeTime, visibleActions,
} from '../sms-ops-domain';
import type { RecoveryActionName, RecoveryItem, RecoveryStatus, RecoveryType } from '../types/sms-ops-types';
import { useSmsOpsLanguage } from './use-sms-ops-language';

const TYPES: RecoveryType[] = ['unknown_send', 'unmatched_reply', 'delivery_failure', 'sync_failure', 'provider_failure'];
const STATUSES: RecoveryStatus[] = ['open', 'resolved', 'dismissed'];
const SEVERITY: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  low: 'bg-muted text-muted-foreground',
};

/** Lead search for "link this reply to a lead" (uses the leads list API). */
export function LeadPicker({ onPick, suggested = [] }: { onPick: (leadId: string) => void; suggested?: { _id: string; name: string; leadNumber?: string | null }[] }) {
  const { t } = useSmsOpsLanguage();
  const [q, setQ] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: ['sms-ops', 'lead-search', q],
    queryFn: () => leadApi.listLeads({ q: q || undefined, limit: 10 } as never),
    enabled: q.trim().length >= 2,
  });
  const results = (data?.data ?? []) as unknown as { id: string; name: string; leadNumber?: string | null }[];
  return (
    <div className="space-y-2">
      {suggested.length ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{t('smsOps.recovery.suggested', 'Suggested (same number)')}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map((l) => (
              <button key={l._id} type="button" onClick={() => onPick(l._id)} className="rounded-full border border-brand-500/40 px-2.5 py-0.5 text-xs hover:bg-brand-500/10" dir="auto">
                {l.name}{l.leadNumber ? <> · <LtrText>{l.leadNumber}</LtrText></> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          aria-label={t('smsOps.recovery.searchLead', 'Search leads')}
          placeholder={t('smsOps.recovery.searchLead', 'Search leads')}
          className="w-full rounded-lg border border-border bg-background py-2 pe-3 ps-8 text-sm"
          value={q}
          dir="auto"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {isFetching ? <p className="text-xs text-muted-foreground">{t('smsOps.loading', 'Loading…')}</p> : null}
      {results.length ? (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-border">
          {results.map((l) => (
            <li key={l.id}>
              <button type="button" className="w-full px-3 py-1.5 text-start text-sm hover:bg-muted" onClick={() => onPick(l.id)}>
                <span dir="auto">{l.name}</span>{l.leadNumber ? <span className="text-muted-foreground"> · <LtrText>{l.leadNumber}</LtrText></span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type Pending = { item: RecoveryItem; action: RecoveryActionName } | null;

function ActionDialog({ pending, onClose }: { pending: Pending; onClose: () => void }) {
  const { t } = useSmsOpsLanguage();
  const m = useSmsOpsMutations();
  const [note, setNote] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState('');
  if (!pending) return null;
  const { item, action } = pending;
  const needsLead = action === 'link_lead';
  const submit = () => {
    if (needsLead && !leadId) return;
    m.recoveryAction.mutate(
      {
        id: item._id, action, note: note.trim() || null,
        ...(needsLead && leadId ? { leadId } : {}),
        ...(action === 'retry_other_sim' && subscriptionId !== '' ? { subscriptionId: Number(subscriptionId) } : {}),
      },
      { onSuccess: () => { showSuccess(t('smsOps.recovery.done', 'Done')); onClose(); } },
    );
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={t(`smsOps.recovery.action.${action}`, RECOVERY_ACTION_FALLBACK[action])} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-3 rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="text-base font-semibold">{t(`smsOps.recovery.action.${action}`, RECOVERY_ACTION_FALLBACK[action])}</h3>
        <p className="text-sm text-muted-foreground">{t(`smsOps.recovery.confirm.${action}`, t('smsOps.recovery.confirm.generic', 'This action is recorded in the audit log.'))}</p>
        {needsLead ? <LeadPicker onPick={setLeadId} suggested={item.details?.suggestedLeads ?? []} /> : null}
        {needsLead && leadId ? <p className="text-xs text-brand-600 dark:text-brand-400">{t('smsOps.recovery.leadChosen', 'Lead selected')}</p> : null}
        {action === 'retry_other_sim' ? (
          <label className="block text-sm">
            <span className="text-muted-foreground">{t('smsOps.recovery.subscriptionId', 'SIM subscription id (empty = phone default)')}</span>
            <input inputMode="numeric" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value.replace(/\D/g, ''))} />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="text-muted-foreground">{t('smsOps.recovery.note', 'Note (optional)')}</span>
          <textarea dir="auto" rows={2} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm hover:bg-muted">{t('smsOps.cancel', 'Cancel')}</button>
          <button type="button" onClick={submit} disabled={m.recoveryAction.isPending || (needsLead && !leadId)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {t('smsOps.confirm', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecoveryRow({ item, selected, onSelect, onAction }: { item: RecoveryItem; selected: boolean; onSelect: (v: boolean) => void; onAction: (a: RecoveryActionName) => void }) {
  const { t, locale } = useSmsOpsLanguage();
  const actions = visibleActions(item);
  return (
    <li className="flex gap-3 border-t border-border px-4 py-3 first:border-t-0" data-testid="recovery-item">
      {item.status === 'open' ? (
        <input type="checkbox" className="mt-1" aria-label={t('smsOps.recovery.select', 'Select')} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
      ) : <span className="w-[13px]" />}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t(`smsOps.recovery.type.${item.type}`, RECOVERY_TYPE_FALLBACK[item.type])}</span>
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${SEVERITY[item.severity] ?? ''}`}>{t(`smsOps.recovery.severity.${item.severity}`, item.severity)}</span>
          {item.lead?.name ? <span className="text-sm text-muted-foreground" dir="auto">{item.lead.name}</span> : null}
          {item.occurrences && item.occurrences > 1 ? <span className="text-xs text-muted-foreground">×{item.occurrences}</span> : null}
          <time className="ms-auto text-xs text-muted-foreground" dateTime={item.createdAt} title={formatDateTime(item.createdAt, locale)}>{relativeTime(item.createdAt, locale)}</time>
        </div>
        {item.details?.body ? <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm" dir="auto" data-testid="recovery-body">{item.details.body}</p> : null}
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {item.details?.fromMasked ? <span>{t('smsOps.recovery.from', 'From')} <LtrText>{item.details.fromMasked}</LtrText></span> : null}
          {item.details?.code ? <span>{t('smsOps.recovery.code', 'Code')} <LtrText>{item.details.code}</LtrText></span> : null}
          {item.details?.cause ? <span>{t(`smsOps.recovery.cause.${item.details.cause}`, String(item.details.cause))}</span> : null}
          {item.deviceId ? <span>{t('smsOps.recovery.device', 'Phone')} <LtrText className="font-mono">{item.deviceId.slice(0, 16)}</LtrText></span> : null}
        </p>
        {item.resolution?.action ? (
          <p className="text-xs text-muted-foreground">
            {t('smsOps.recovery.resolvedAs', 'Resolved: {action}', { action: t(`smsOps.recovery.action.${item.resolution.action}`, RECOVERY_ACTION_FALLBACK[item.resolution.action as RecoveryActionName] ?? item.resolution.action) })}
            {item.resolution.note ? <span dir="auto"> — {item.resolution.note}</span> : null}
          </p>
        ) : null}
        {actions.length ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {actions.map((a) => (
              <button key={a} type="button" onClick={() => onAction(a)} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${a === 'dismiss' ? 'border-border text-muted-foreground hover:bg-muted' : 'border-brand-500/40 text-brand-600 hover:bg-brand-500/10 dark:text-brand-400'}`}>
                {t(`smsOps.recovery.action.${a}`, RECOVERY_ACTION_FALLBACK[a])}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function RecoveryInbox() {
  const { t } = useSmsOpsLanguage();
  const [type, setType] = useState<RecoveryType | ''>('');
  const [status, setStatus] = useState<RecoveryStatus>('open');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Pending>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const counts = useRecoveryCounts();
  const { data, isLoading, isError, refetch } = useRecoveryItems({ type: type || undefined, status, page });
  const m = useSmsOpsMutations();
  const items = data?.data ?? [];
  const selectedIds = Object.keys(selected).filter((id) => selected[id] && items.some((i) => i._id === id));

  const onAction = (item: RecoveryItem, action: RecoveryActionName) => {
    if (action === 'link_lead' || CONFIRM_ACTIONS.has(action)) { setPending({ item, action }); return; }
    m.recoveryAction.mutate({ id: item._id, action }, { onSuccess: () => showSuccess(t('smsOps.recovery.done', 'Done')) });
  };
  const bulkDismiss = () => {
    m.bulkDismiss.mutate({ ids: selectedIds }, {
      onSuccess: (r) => { showSuccess(t('smsOps.recovery.dismissedN', '{n} dismissed', { n: r?.dismissed ?? selectedIds.length })); setSelected({}); setConfirmBulk(false); },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('smsOps.recovery.byType', 'By type')}>
        <button type="button" onClick={() => { setType(''); setPage(1); }} className={`rounded-full px-3 py-1 text-sm ${type === '' ? 'bg-brand-500 text-white' : 'bg-muted'}`}>
          {t('smsOps.recovery.all', 'All')} <span className="tabular-nums">({counts.data?.open ?? 0})</span>
        </button>
        {TYPES.map((ty) => (
          <button key={ty} type="button" onClick={() => { setType(ty); setPage(1); }} className={`rounded-full px-3 py-1 text-sm ${type === ty ? 'bg-brand-500 text-white' : 'bg-muted'}`}>
            {t(`smsOps.recovery.type.${ty}`, RECOVERY_TYPE_FALLBACK[ty])} <span className="tabular-nums">({counts.data?.byType?.[ty] ?? 0})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('smsOps.recovery.status', 'Status')} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value as RecoveryStatus); setPage(1); setSelected({}); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`smsOps.recovery.statusValue.${s}`, s)}</option>)}
        </select>
        {status === 'open' && items.length ? (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selectedIds.length === items.length && items.length > 0} onChange={(e) => setSelected(e.target.checked ? Object.fromEntries(items.map((i) => [i._id, true])) : {})} />
            {t('smsOps.recovery.selectAll', 'Select all')}
          </label>
        ) : null}
        {selectedIds.length ? (
          <button type="button" onClick={() => setConfirmBulk(true)} className="ms-auto rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            {t('smsOps.recovery.bulkDismiss', 'Dismiss selected ({n})', { n: selectedIds.length })}
          </button>
        ) : null}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">{t('smsOps.loading', 'Loading…')}</p> : null}
      {isError ? <button type="button" className="text-sm text-brand-500" onClick={() => void refetch()}>{t('smsOps.loadError', 'Could not load. Retry')}</button> : null}
      {!isLoading && !isError && !items.length ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t('smsOps.recovery.empty', 'Nothing needs recovery')}</p>
        </div>
      ) : null}
      {items.length ? (
        <ul className="rounded-xl border border-border bg-card">
          {items.map((item) => (
            <RecoveryRow key={item._id} item={item} selected={Boolean(selected[item._id])} onSelect={(v) => setSelected((s) => ({ ...s, [item._id]: v }))} onAction={(a) => onAction(item, a)} />
          ))}
        </ul>
      ) : null}
      {data && data.pagination.pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 disabled:opacity-40">{t('smsOps.previous', 'Previous')}</button>
          <span className="tabular-nums">{page} / {data.pagination.pages}</span>
          <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 disabled:opacity-40">{t('smsOps.next', 'Next')}</button>
        </div>
      ) : null}

      <ActionDialog key={pending ? `${pending.item._id}:${pending.action}` : 'none'} pending={pending} onClose={() => setPending(null)} />
      {confirmBulk ? (
        <div role="dialog" aria-modal="true" aria-label={t('smsOps.recovery.bulkDismissTitle', 'Dismiss selected items?')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 className="font-semibold">{t('smsOps.recovery.bulkDismissTitle', 'Dismiss selected items?')}</h3>
            <p className="text-sm text-muted-foreground">{t('smsOps.recovery.bulkDismissHint', '{n} items will be closed without any other action. This is recorded in the audit log.', { n: selectedIds.length })}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmBulk(false)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-muted">{t('smsOps.cancel', 'Cancel')}</button>
              <button type="button" onClick={bulkDismiss} disabled={m.bulkDismiss.isPending} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{t('smsOps.confirm', 'Confirm')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
