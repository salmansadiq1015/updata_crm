'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, GitMerge, History, Loader2, Mail, Phone, Radar, RotateCcw, Undo2, Globe, MapPin, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { usePermissions } from '@/shared/hooks/use-permissions';
import {
  useDismissDuplicate, useDuplicateGroups, useLeadMerges, useResumeMerge, useScanDuplicates, useUndoMerge,
} from '../hooks/use-lead-quality';
import type { DuplicateGroup, LeadMergeRecord } from '../types/lead-quality-types';
import { Button, ConfirmDialog, useLanguage } from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { LeadScoreBadge } from './lead-score-badge';
import { LeadMergeDialog } from './lead-merge-dialog';
import type { MergeCandidateLead } from './lead-merge-dialog';

export const LEAD_MERGE_PERMISSION = 'lead:merge';

const CONFIDENCE_OPTIONS = [0, 0.7, 0.9];

type ApiErr = { response?: { data?: { error?: { code?: string; message?: string; details?: Array<{ field?: string }> } } } };
const apiError = (err: unknown) => (err as ApiErr)?.response?.data?.error;

const METHOD_FALLBACK: Record<string, string> = {
  PLACE_ID: 'Same place', PHONE: 'Same phone', EMAIL: 'Same email', WEBSITE: 'Same website',
  NAME_POSTAL: 'Same name + postcode', NAME_NEARBY: 'Same name nearby', BUSINESS_IDENTITY: 'Same business identity',
};

function methodLabel(t: TranslateFn, method: string) {
  return t(`leads.dup.method.${method}`, METHOD_FALLBACK[method] ?? method.replace(/_/g, ' ').toLowerCase());
}

function GroupCard({ group, canMerge, onCompare, onDismiss, dismissing }: {
  group: DuplicateGroup; canMerge: boolean; onCompare: () => void; onDismiss: () => void; dismissing: boolean;
}) {
  const { t } = useLanguage();
  const methods = [...new Set(group.pairs.flatMap((p) => p.reasons.map((r) => r.method)))];
  return (
    <article className="rounded-2xl border border-border/70 bg-card p-4 shadow-theme-sm" data-testid="duplicate-group">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            {t('leads.dup.confidence', '{value}% match', { value: Math.round(group.confidence * 100) })}
          </span>
          {methods.map((m) => (
            <span key={m} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">{methodLabel(t, m)}</span>
          ))}
        </div>
        {canMerge && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onDismiss} disabled={dismissing}>
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.dup.notDuplicate', 'Not duplicates')}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={onCompare}>
              <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.dup.compare', 'Compare & merge')}
            </Button>
          </div>
        )}
      </header>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {group.leads.map((lead) => (
          <div key={lead.id} className="min-w-0 rounded-xl border border-border/60 bg-background/60 p-3" data-lead={lead.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/leads?detail=${lead.id}`} className="block truncate text-[13px] font-semibold text-foreground hover:text-primary">{lead.name}</Link>
                <p className="font-mono text-[11px] text-muted-foreground">{lead.leadNumber}</p>
              </div>
              <LeadScoreBadge score={lead.score} />
            </div>
            <ul className="mt-2 space-y-0.5 text-[12px] text-muted-foreground">
              {(lead.phone || lead.mobile) && <li className="flex items-center gap-1.5"><Phone className="h-3 w-3" aria-hidden="true" /><bdi>{lead.phone || lead.mobile}</bdi></li>}
              {lead.email && <li className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3" aria-hidden="true" /><bdi>{lead.email}</bdi></li>}
              {lead.website && <li className="flex items-center gap-1.5 truncate"><Globe className="h-3 w-3" aria-hidden="true" /><bdi>{lead.website}</bdi></li>}
              {(lead.city || lead.postalCode) && <li className="flex items-center gap-1.5"><MapPin className="h-3 w-3" aria-hidden="true" />{[lead.street, [lead.postalCode, lead.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</li>}
            </ul>
          </div>
        ))}
      </div>
    </article>
  );
}

function userName(user: LeadMergeRecord['mergedBy']) {
  if (!user || typeof user === 'string') return null;
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || null;
}

function MergeHistory({ canMerge }: { canMerge: boolean }) {
  const { t, locale } = useLanguage();
  const query = useLeadMerges();
  const undo = useUndoMerge();
  const resume = useResumeMerge();
  const [confirm, setConfirm] = useState<LeadMergeRecord | null>(null);
  const merges = query.data?.pages.flatMap((p) => p.data) ?? [];

  const onUndo = () => {
    if (!confirm) return;
    undo.mutate(confirm.id, {
      onSuccess: () => { showSuccess(t('leads.merge.undone', 'Merge undone')); setConfirm(null); },
      onError: (err) => {
        const e = apiError(err);
        showError(e?.code === 'UNDO_CONFLICT'
          ? t('leads.merge.undoConflict', 'This merge cannot be undone safely: {fields}', { fields: (e.details || []).map((d) => d.field).filter(Boolean).join(', ') })
          : (e?.message || String(err)));
        setConfirm(null);
      },
    });
  };

  if (query.isLoading) return <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />…</p>;
  if (!merges.length) return <p className="rounded-xl border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">{t('leads.merge.history.empty', 'No merges yet.')}</p>;

  return (
    <>
      <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card" data-testid="merge-history">
        {merges.map((m) => {
          const moved = Object.values(m.counts).reduce((n, c) => n + c.moved, 0);
          const who = userName(m.mergedBy);
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">
                  {t('leads.merge.history.into', '{loser} → {survivor}', {
                    loser: [m.loserNumber, m.loserName].filter(Boolean).join(' '),
                    survivor: [m.survivorNumber, m.survivorName].filter(Boolean).join(' '),
                  })}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t(`leads.merge.status.${m.status}`, m.status)}
                  {' · '}{t('leads.merge.history.moved', '{count} records moved', { count: moved })}
                  {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString(locale)}` : ''}
                  {who ? ` · ${t('leads.merge.history.by', 'by {name}', { name: who })}` : ''}
                </p>
                {m.status === 'in_progress' && m.lastError && <p className="text-[11px] text-destructive">{m.lastError}</p>}
              </div>
              {canMerge && m.status === 'completed' && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirm(m)}>
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.merge.undo', 'Undo')}
                </Button>
              )}
              {canMerge && m.status === 'in_progress' && (
                <Button size="sm" className="gap-1.5" disabled={resume.isPending} onClick={() => resume.mutate(m.id, {
                  onSuccess: () => showSuccess(t('leads.merge.resumed', 'Merge completed')),
                  onError: (err) => showError(apiError(err)?.message || String(err)),
                })}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.merge.resume', 'Resume')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {query.hasNextPage && (
        <Button variant="ghost" className="mt-2" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>{t('leads.merge.loadMore', 'Load more')}</Button>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={t('leads.merge.undo', 'Undo')}
        description={t('leads.merge.undoConfirm', 'Undo this merge? Both leads and their history are restored as they were.')}
        onConfirm={onUndo}
        loading={undo.isPending}
        confirmText={t('leads.merge.undo', 'Undo')}
        cancelText={t('leads.merge.cancel', 'Cancel')}
      />
    </>
  );
}

/** `/leads/duplicates` — review queue (grouped candidates) + merge history with undo. */
export function LeadDuplicatesView() {
  const { t } = useLanguage();
  const { hasPermission, isAdmin } = usePermissions();
  const canMerge = isAdmin || hasPermission(LEAD_MERGE_PERMISSION);
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const [minConfidence, setMinConfidence] = useState(0);
  const groups = useDuplicateGroups(minConfidence);
  const scan = useScanDuplicates();
  const dismiss = useDismissDuplicate();
  const [active, setActive] = useState<DuplicateGroup | null>(null);

  const mergeLeads: MergeCandidateLead[] = useMemo(
    () => (active?.leads ?? []).map((l) => ({ id: l.id, name: l.name, leadNumber: l.leadNumber })),
    [active],
  );
  const candidateIdFor = (a: string, b: string) => active?.pairs.find((p) => p.leadIds.includes(a) && p.leadIds.includes(b))?.id ?? null;

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="space-y-5 p-4 pb-16 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm" aria-label={t('leads.title', 'Leads')}>
              <Link href="/leads"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></Link>
            </Button>
            <div className="rounded-xl bg-primary/10 p-2.5 ring-1 ring-primary/20"><Copy className="h-5 w-5 text-primary" aria-hidden="true" /></div>
            <div>
              <h1 className="text-[18px] font-semibold text-foreground">{t('leads.dup.title', 'Duplicate review')}</h1>
              <p className="max-w-2xl text-[13px] text-muted-foreground">{t('leads.dup.subtitle', 'Suspected duplicates found from recorded phone, email, website, place id, name and address. Merging keeps all history.')}</p>
            </div>
          </div>
          {canMerge && (
            <Button variant="outline" className="h-9 gap-2" disabled={scan.isPending} onClick={() => scan.mutate(undefined, {
              onSuccess: () => showSuccess(t('leads.dup.scanQueued', 'Duplicate scan queued')),
              onError: (err) => showError(apiError(err)?.message || String(err)),
            })}>
              <Radar className="h-4 w-4" aria-hidden="true" />{t('leads.dup.scan', 'Scan now')}
            </Button>
          )}
        </div>

        <div role="tablist" className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-0.5 w-fit">
          {([['queue', Copy, t('leads.dup.tab.queue', 'Review queue')], ['history', History, t('leads.dup.tab.history', 'Merge history')]] as const).map(([key, Icon, text]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn('flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium', tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{text}
            </button>
          ))}
        </div>

        {tab === 'queue' ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted-foreground">{t('leads.dup.groupCount', '{count} suspected groups', { count: groups.data?.total ?? 0 })}</p>
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                {t('leads.dup.minConfidence', 'Minimum confidence')}
                <select className="h-8 rounded-lg border border-border bg-background px-2 text-[12px]" value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))}>
                  {CONFIDENCE_OPTIONS.map((c) => <option key={c} value={c}>{c === 0 ? t('leads.dup.confidence.all', 'All') : `≥ ${Math.round(c * 100)}%`}</option>)}
                </select>
              </label>
            </div>
            {groups.isLoading && <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />…</p>}
            {groups.isError && <p role="alert" className="text-[13px] text-destructive">{t('leads.dup.loadError', 'Duplicates could not be loaded.')}</p>}
            {groups.data && groups.data.groups.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">{t('leads.dup.empty', 'No open duplicates — nice and clean.')}</p>
            )}
            {groups.data?.groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                canMerge={canMerge}
                onCompare={() => setActive(g)}
                dismissing={dismiss.isPending}
                onDismiss={() => dismiss.mutate({ candidateIds: g.pairs.map((p) => p.id) }, {
                  onSuccess: () => showSuccess(t('leads.dup.dismissed', 'Remembered as not duplicates')),
                  onError: (err) => showError(apiError(err)?.message || String(err)),
                })}
              />
            ))}
          </section>
        ) : (
          <MergeHistory canMerge={canMerge} />
        )}
      </div>
      <LeadMergeDialog
        key={active?.id ?? 'none'}
        open={Boolean(active)}
        onOpenChange={(o) => { if (!o) setActive(null); }}
        leads={mergeLeads}
        candidateIdFor={candidateIdFor}
      />
    </div>
  );
}
