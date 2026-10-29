'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight, GitMerge, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { useMergeLeads, useMergePreview } from '../hooks/use-lead-quality';
import type { FieldSelections, FieldWinner, MergeableField, MergePreview } from '../types/lead-quality-types';
import {
  Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, useLanguage,
} from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';

const FIELD_LABEL: Record<MergeableField, [string, string]> = {
  name: ['leads.col.name', 'Name'],
  type: ['leads.col.type', 'Type'],
  status: ['leads.col.status', 'Status'],
  phone: ['leads.col.phone', 'Phone'],
  mobile: ['leads.form.mobile', 'Mobile'],
  email: ['leads.col.email', 'Email'],
  website: ['leads.form.website', 'Website'],
  address: ['leads.drawer.sectionAddress', 'Address'],
  location: ['leads.map.open', 'Location'],
  providerMeta: ['leads.col.rating', 'Rating'],
  social: ['leads.social.section', 'Social profiles'],
  assignedTo: ['leads.col.assignedTo', 'Assigned to'],
  notes: ['leads.drawer.sectionNotes', 'Notes'],
};

/** Human-readable rendering of a stored field value for the side-by-side table. */
export function formatMergeValue(field: MergeableField, value: unknown): string | null {
  if (value == null || value === '') return null;
  const v = value as Record<string, unknown>;
  switch (field) {
    case 'address': {
      const line = [v.street, [v.postalCode, v.city].filter(Boolean).join(' '), v.country].filter(Boolean).join(', ');
      return line || null;
    }
    case 'location': {
      const c = Array.isArray(v.coordinates) ? v.coordinates : null;
      return c && c.length === 2 ? `${Number(c[1]).toFixed(5)}, ${Number(c[0]).toFixed(5)}` : null;
    }
    case 'providerMeta':
      return typeof v.rating === 'number' ? `★ ${v.rating}${typeof v.reviewCount === 'number' ? ` (${v.reviewCount})` : ''}` : null;
    case 'social': {
      const links = Object.values(v).filter(Boolean) as string[];
      return links.length ? links.join(' · ') : null;
    }
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

export type MergeCandidateLead = { id: string; name: string; leadNumber: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: MergeCandidateLead[];
  /** Pair candidate id (resolved on the server when the pair is merged). */
  candidateIdFor?: (survivorId: string, loserId: string) => string | null;
  onMerged?: () => void;
};

function label(t: TranslateFn, field: MergeableField) {
  const [key, fallback] = FIELD_LABEL[field];
  return t(key, fallback);
}

export function buildSelections(preview: MergePreview | undefined, picks: FieldSelections): FieldSelections {
  if (!preview) return {};
  const out: FieldSelections = {};
  for (const f of preview.fields) out[f.field] = picks[f.field] ?? f.defaultWinner;
  return out;
}

/**
 * Remount (via `key`) for a new candidate group: state initializes from `leads`.
 *
 * Side-by-side compare + per-field winner picker + preview of the history that
 * will move. The server re-validates everything and performs the merge as one
 * resumable, undoable operation.
 */
export function LeadMergeDialog({ open, onOpenChange, leads, candidateIdFor, onMerged }: Props) {
  const { t } = useLanguage();
  const [survivorId, setSurvivorId] = useState<string | null>(leads[0]?.id ?? null);
  const [loserId, setLoserId] = useState<string | null>(leads[1]?.id ?? null);
  const [picks, setPicks] = useState<FieldSelections>({});

  const preview = useMergePreview(open ? survivorId : null, open ? loserId : null);
  const merge = useMergeLeads();
  const selections = useMemo(() => buildSelections(preview.data, picks), [preview.data, picks]);

  const swap = () => { setSurvivorId(loserId); setLoserId(survivorId); setPicks({}); };
  const pick = (field: MergeableField, winner: FieldWinner) => setPicks((p) => ({ ...p, [field]: winner }));

  const onMerge = () => {
    if (!survivorId || !loserId) return;
    merge.mutate(
      { survivorId, loserId, candidateId: candidateIdFor?.(survivorId, loserId) ?? null, fieldSelections: selections },
      {
        onSuccess: () => { showSuccess(t('leads.merge.done', 'Leads merged')); onOpenChange(false); onMerged?.(); },
        onError: (err: unknown) => {
          const code = (err as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error;
          showError(code?.code === 'MERGE_INTERRUPTED' ? t('leads.merge.interrupted', 'The merge was interrupted. Resume it from the merge history.') : (code?.message || String(err)));
        },
      },
    );
  };

  const p = preview.data;
  const nameOf = (id: string | null) => leads.find((l) => l.id === id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GitMerge className="h-4 w-4 text-primary" aria-hidden="true" />{t('leads.merge.title', 'Merge leads')}</DialogTitle>
          <DialogDescription>{t('leads.merge.description', 'Choose the lead to keep and, per field, which value wins. All communication history moves to the kept lead.')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <LeadPicker title={t('leads.merge.keep', 'Keep')} value={survivorId} leads={leads} exclude={loserId} onChange={(id) => { setSurvivorId(id); setPicks({}); }} />
            <Button variant="ghost" size="icon-sm" onClick={swap} aria-label={t('leads.merge.swap', 'Swap')} title={t('leads.merge.swap', 'Swap')}>
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <LeadPicker title={t('leads.merge.mergeAway', 'Merge into kept lead')} value={loserId} leads={leads} exclude={survivorId} onChange={(id) => { setLoserId(id); setPicks({}); }} />
          </div>

          {preview.isLoading && <p className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />…</p>}
          {preview.isError && <p role="alert" className="text-[12px] text-destructive">{t('leads.merge.previewError', 'The merge preview could not be loaded.')}</p>}

          {p && (
            <>
              <table className="w-full table-fixed border-separate border-spacing-0 text-[12px]" data-testid="merge-fields">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-32 pb-1.5">{t('leads.merge.field', 'Field')}</th>
                    <th className="pb-1.5">{nameOf(survivorId)?.leadNumber ?? p.survivor.leadNumber} · {t('leads.merge.keep', 'Keep')}</th>
                    <th className="pb-1.5">{nameOf(loserId)?.leadNumber ?? p.loser.leadNumber}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.fields.map((f) => {
                    const sv = formatMergeValue(f.field, f.survivorValue);
                    const lv = formatMergeValue(f.field, f.loserValue);
                    const winner = selections[f.field];
                    const option = (side: 'survivor' | 'loser', text: string | null) => (
                      <label className={cn('flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 transition-colors', winner === side ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/50', f.same && 'cursor-default')}>
                        <input
                          type="radio"
                          name={`merge-${f.field}`}
                          className="mt-0.5 accent-[hsl(var(--primary))]"
                          checked={winner === side}
                          disabled={f.same}
                          onChange={() => pick(f.field, side)}
                          aria-label={`${label(t, f.field)}: ${text ?? t('leads.merge.empty', 'empty')}`}
                        />
                        <span className={cn('min-w-0 break-words', !text && 'italic text-muted-foreground')}>{text ?? t('leads.merge.empty', 'empty')}</span>
                      </label>
                    );
                    return (
                      <tr key={f.field} className="align-top" data-field={f.field}>
                        <td className="border-t border-border/60 py-1.5 pe-2 font-medium text-foreground">
                          {label(t, f.field)}
                          {f.same && <span className="block text-[10px] font-normal text-muted-foreground">{t('leads.merge.same', 'identical')}</span>}
                        </td>
                        <td className="border-t border-border/60 py-1">{option('survivor', sv)}</td>
                        <td className="border-t border-border/60 py-1">
                          {option('loser', lv)}
                          {f.field === 'notes' && sv && lv && !f.same && (
                            <label className="mt-1 flex items-center gap-2 px-2 text-[11px] text-muted-foreground">
                              <input type="radio" name="merge-notes" checked={winner === 'both'} onChange={() => pick('notes', 'both')} />
                              {t('leads.merge.both', 'Keep both')}
                            </label>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <section className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('leads.merge.historyTitle', 'History that will move')}</p>
                {p.counts.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">{t('leads.merge.nothingToMove', 'No history records to move.')}</p>
                ) : (
                  <ul className="grid gap-1 sm:grid-cols-2" data-testid="merge-counts">
                    {p.counts.map((c) => (
                      <li key={c.key} className="text-[12px]">
                        <span className="font-medium text-foreground">{c.label}</span>
                        {': '}
                        {c.move > 0 && t('leads.merge.moveCount', '{count} will move', { count: c.move })}
                        {c.retained > 0 && <span className="block text-[11px] text-muted-foreground">{t('leads.merge.retainedCount', '{count} stay linked via the merged lead (same campaign)', { count: c.retained })}</span>}
                        {c.consentUpgrades > 0 && <span className="block text-[11px] text-muted-foreground">{t('leads.merge.consentUpgrades', '{count} consent records: the stricter status is kept', { count: c.consentUpgrades })}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {p.qualification.takeoverKeys.length > 0 && (
                  <p className="mt-2 text-[12px] text-muted-foreground">{t('leads.merge.qualification', 'Qualification answers taken over: {keys}', { keys: p.qualification.takeoverKeys.join(', ') })}</p>
                )}
                {p.tagsToAdd.length > 0 && (
                  <p className="text-[12px] text-muted-foreground">{t('leads.merge.tags', 'Tags added: {tags}', { tags: p.tagsToAdd.join(', ') })}</p>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  {t('leads.merge.dnc', 'Do-not-contact and opt-outs are always preserved.')}
                </p>
              </section>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('leads.merge.cancel', 'Cancel')}</Button>
          <Button onClick={onMerge} disabled={!p || merge.isPending || !survivorId || !loserId} className="gap-1.5 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white">
            {merge.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GitMerge className="h-4 w-4" aria-hidden="true" />}
            {merge.isPending ? t('leads.merge.merging', 'Merging…') : t('leads.merge.confirm', 'Merge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadPicker({ title, value, leads, exclude, onChange }: { title: string; value: string | null; leads: MergeCandidateLead[]; exclude: string | null; onChange: (id: string) => void }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      <select
        className="h-9 w-full rounded-lg border border-border bg-background px-2 text-[13px]"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label={title}
      >
        {leads.filter((l) => l.id !== exclude).map((l) => (
          <option key={l.id} value={l.id}>{[l.leadNumber, l.name].filter(Boolean).join(' · ')}</option>
        ))}
      </select>
    </label>
  );
}
