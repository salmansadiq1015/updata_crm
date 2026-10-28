'use client';

import { useState, type ReactElement } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Phone, Trash2 } from 'lucide-react';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { usePreviewEligibility, useRecipients, useRemoveRecipients } from '../hooks/use-ai-calling';
import { ELIGIBILITY_FIX_TEXT, ELIGIBILITY_REASON_TEXT, isRecipientRemovable, RecipientReasons } from './campaign-lead-picker';
import { StatusPill } from './status-pill';

// ConfirmDialog is an untyped .jsx; loosen its prop types for this .tsx module.
const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

/** Consent / phone / suppression reasons collapse to one line each; the three consent variants share a fix. */
function reasonLines(reasonCounts: Record<string, number>): string[] {
  const merged = new Map<string, number>();
  for (const [code, n] of Object.entries(reasonCounts)) {
    const key = ['consent_required', 'consent_expired', 'consent_revoked'].includes(code) ? 'consent_required' : code;
    merged.set(key, (merged.get(key) || 0) + n);
  }
  return [...merged.entries()].map(([code, n]) => `${n} · ${ELIGIBILITY_REASON_TEXT[code] || code}${ELIGIBILITY_FIX_TEXT[code] ? ` — ${ELIGIBILITY_FIX_TEXT[code]}` : ''}`);
}

/**
 * Pre-save eligibility for the chosen leads, shown during campaign creation so consent /
 * phone / suppression problems surface here instead of only when the campaign is started.
 */
export function EligibilityNotice({ leadIds, channel }: { leadIds: string[]; channel: 'voice' | 'web_link' }) {
  const verb = channel === 'web_link' ? 'texted' : 'called';
  const { data, isLoading, isError } = usePreviewEligibility(leadIds, channel, leadIds.length > 0);
  if (!leadIds.length) return null;
  if (isLoading) {
    return <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking which leads can be {verb}…</p>;
  }
  if (isError || !data) return null;
  if (data.eligible === data.total && !data.unavailable) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> All {data.total} selected lead{data.total === 1 ? '' : 's'} can be {verb}.
      </p>
    );
  }
  const lines = reasonLines(data.reasonCounts);
  if (data.unavailable) lines.push(`${data.unavailable} · Lead no longer available — these leads were deleted or converted`);
  return (
    <div role="alert" className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" />
        {data.eligible === 0
          ? `None of your ${data.total} selected lead${data.total === 1 ? '' : 's'} can be ${verb} yet`
          : `${data.total - data.eligible} of ${data.total} selected leads can’t be ${verb} yet`}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        {lines.map((line) => <li key={line}>• {line}</li>)}
      </ul>
      <p className="mt-1.5 text-muted-foreground">You can still save this as a draft; the campaign won’t start until at least one lead is eligible.</p>
    </div>
  );
}

/**
 * Read-only list of the leads already enrolled in a campaign, shown when editing (where the
 * selection is locked). Each row shows the phone number and, if held, why it is ineligible.
 */
export function EnrolledRecipientsList({ campaignId, verb = 'call' }: { campaignId: string; verb?: 'call' | 'text' }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useRecipients(campaignId, undefined, page);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const removeRecipients = useRemoveRecipients(campaignId);

  if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (isError && !data) {
    return <p className="p-2 text-sm text-muted-foreground">Leads could not be loaded. <button type="button" onClick={() => refetch()} className="font-semibold text-brand-500 hover:underline">Try again</button></p>;
  }
  const rows = (data?.data ?? []) as Array<Record<string, any>>;
  const total = data?.pagination?.total ?? rows.length;
  const pages = data?.pagination?.pages ?? 1;
  if (!rows.length) return <p className="p-2 text-sm text-muted-foreground">This campaign has no recipients.</p>;

  const removableIds = rows.filter((r) => isRecipientRemovable(r.state)).map((r) => String(r._id));
  const allSelected = removableIds.length > 0 && removableIds.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const doRemove = () => removeRecipients.mutate([...selected], { onSettled: () => { setSelected(new Set()); setConfirmRemove(false); } });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" aria-label="Select all removable recipients" className="h-4 w-4 accent-brand-500" checked={allSelected} disabled={!removableIds.length} onChange={() => setSelected(allSelected ? new Set() : new Set(removableIds))} />
          Select all
        </label>
        {selected.size > 0 ? (
          <button type="button" onClick={() => setConfirmRemove(true)} disabled={removeRecipients.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50">
            {removeRecipients.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove {selected.size}
          </button>
        ) : null}
      </div>
      <div className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
        {rows.map((r) => {
          const id = String(r._id);
          const phone = r.leadId?.mobile || r.leadId?.phone || r.phoneSnapshot || null;
          const reasons = (r.eligibility?.reasons ?? []) as string[];
          const removable = isRecipientRemovable(r.state);
          return (
            <div key={id} className={`flex items-start gap-2 px-3 py-2 text-sm ${selected.has(id) ? 'bg-brand-500/5' : ''}`}>
              <input
                type="checkbox"
                aria-label={`Select ${r.leadId?.name || 'recipient'}`}
                className="mt-0.5 h-4 w-4 accent-brand-500"
                checked={selected.has(id)}
                disabled={!removable}
                title={removable ? undefined : 'In a call — cannot be removed now'}
                onChange={() => toggle(id)}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.leadId?.name || '—'}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {r.leadId?.leadNumber ? <span>{r.leadId.leadNumber}</span> : null}
                  {phone ? <a href={`tel:${phone}`} className="inline-flex items-center gap-1 tabular-nums hover:text-foreground hover:underline"><Phone className="h-3 w-3" />{phone}</a> : <span className="text-rose-600 dark:text-rose-400">No phone</span>}
                </div>
                <RecipientReasons leadId={r.leadId?._id ? String(r.leadId._id) : null} reasons={reasons} />
              </div>
              <StatusPill status={r.state} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{total} recipient{total === 1 ? '' : 's'} enrolled. Tick a lead to remove it; only leads with a valid phone and no do-not-call flag are {verb === 'call' ? 'called' : 'texted'}.</span>
        {pages > 1 ? (
          <div className="flex shrink-0 gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-border px-2 py-1 font-semibold hover:bg-muted disabled:opacity-50">Prev</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border border-border px-2 py-1 font-semibold hover:bg-muted disabled:opacity-50">Next</button>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${selected.size} recipient${selected.size === 1 ? '' : 's'}?`}
        description="They will no longer be called by this campaign. Any past call history is kept. A recipient currently in a call is skipped."
        confirmText="Remove"
        cancelText="Keep"
        variant="destructive"
        isLoading={removeRecipients.isPending}
        onConfirm={doRemove}
      />
    </div>
  );
}
