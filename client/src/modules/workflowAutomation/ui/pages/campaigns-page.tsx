'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Filter, Megaphone, Pause, Play, Plus, Search, Square, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/shared/components/page-header';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { leadApi } from '@/modules/leads/services/lead-api';
import { useCampaignMutations, useWorkflowCatalog, useWorkflowCampaigns, useWorkflows } from '../../hooks/use-workflows';
import { workflowApi } from '../../services/workflow-api';
import { formatNumber, formatRelative, refName } from '../../lib/format';
import type { CampaignSelection, CampaignStatus, WorkflowCampaign } from '../../types/workflow-types';
import { CampaignStatusBadge, OutcomeBadge } from '../shared/status-badge';
import { EmptyBlock, ErrorBlock, Pager, Panel, RUN_SEGMENT_CLASSES, SegmentBar } from './page-kit';

const MAX_LEADS = 5000;
type CampaignAction = 'start' | 'pause' | 'resume' | 'stop';
const ACTION_LABELS: Record<CampaignAction, string> = { start: 'Start', pause: 'Pause', resume: 'Resume', stop: 'Stop' };
const CONFIRM_TITLES: Record<CampaignAction, string> = { start: 'Start this campaign?', pause: 'Pause this campaign?', resume: 'Resume this campaign?', stop: 'Stop this campaign?' };

export function useCampaignActionConfirm() {
  const { t } = useLanguage();
  const m = useCampaignMutations();
  const [pending, setPending] = useState<{ campaign: WorkflowCampaign; action: CampaignAction } | null>(null);
  const dialog = (
    <ConfirmDialog
      open={Boolean(pending)}
      onOpenChange={(open: boolean) => !open && setPending(null)}
      variant={pending?.action === 'stop' ? 'destructive' : 'default'}
      title={pending ? t(`workflowPages.campaigns.confirm.${pending.action}.title`, CONFIRM_TITLES[pending.action]) : ''}
      description={pending ? t(`workflowPages.campaigns.confirm.${pending.action}.desc`, '') : ''}
      confirmText={pending ? t(`workflowPages.campaigns.action.${pending.action}`, ACTION_LABELS[pending.action]) : ''}
      cancelText={t('workflowPages.common.cancel', 'Cancel')}
      loading={m.action.isPending}
      onConfirm={() => pending && m.action.mutate({ id: pending.campaign._id, action: pending.action }, { onSettled: () => setPending(null) })}
    />
  );
  return { ask: (campaign: WorkflowCampaign, action: CampaignAction) => setPending({ campaign, action }), dialog };
}

export function CampaignActions({ campaign, onAsk, size = 'sm' }: { campaign: WorkflowCampaign; onAsk: (c: WorkflowCampaign, a: CampaignAction) => void; size?: 'sm' | 'default' }) {
  const { t } = useLanguage();
  const s: CampaignStatus = campaign.status;
  return (
    <div className="flex flex-wrap gap-1.5">
      {s === 'draft' && <Button size={size} className="gap-1.5" onClick={() => onAsk(campaign, 'start')}><Play className="size-3.5" />{t('workflowPages.campaigns.action.start', 'Start')}</Button>}
      {s === 'running' && <Button size={size} variant="outline" className="gap-1.5" onClick={() => onAsk(campaign, 'pause')}><Pause className="size-3.5" />{t('workflowPages.campaigns.action.pause', 'Pause')}</Button>}
      {s === 'paused' && <Button size={size} className="gap-1.5" onClick={() => onAsk(campaign, 'resume')}><Play className="size-3.5" />{t('workflowPages.campaigns.action.resume', 'Resume')}</Button>}
      {['draft', 'running', 'paused'].includes(s) && <Button size={size} variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => onAsk(campaign, 'stop')}><Square className="size-3.5" />{t('workflowPages.campaigns.action.stop', 'Stop')}</Button>}
    </div>
  );
}

export function CampaignsPage() {
  const { t, locale } = useLanguage();
  const { hasPermission } = usePermissions();
  const canExecute = hasPermission('workflow:execute');
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = useWorkflowCampaigns({ status: status === 'all' ? undefined : status, page, limit: 20 });
  const confirm = useCampaignActionConfirm();

  return (
    <div className="space-y-6">
      <PageHeader title={t('workflow.nav.campaigns', 'Campaigns')} description={t('workflowPages.campaigns.description', 'Enroll lead lists into published workflows and control them while they run.')} icon={Megaphone} count={query.data?.pagination.total}>
        {canExecute && <Button className="gap-2" onClick={() => setCreating(true)}><Plus className="size-4" />{t('workflowPages.campaigns.new', 'New campaign')}</Button>}
      </PageHeader>

      <Panel bodyClassName="p-0" action={
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-44" aria-label={t('workflowPages.common.status', 'Status')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('workflowPages.list.allStatuses', 'All statuses')}</SelectItem>
            {(['draft', 'running', 'paused', 'stopped', 'completed'] as CampaignStatus[]).map((s) => <SelectItem key={s} value={s}>{t(`workflow.campaignStatus.${s}`, s)}</SelectItem>)}
          </SelectContent>
        </Select>
      } title={t('workflowPages.campaigns.all', 'All campaigns')}>
        {query.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          : query.isError ? <div className="p-4"><ErrorBlock onRetry={() => query.refetch()} /></div>
          : !query.data?.data.length ? (
            <div className="p-4"><EmptyBlock icon={Megaphone} title={t('workflowPages.campaigns.emptyTitle', 'No campaigns yet')} description={t('workflowPages.campaigns.emptyHint', 'A campaign enrolls a list of leads into a published workflow — for example every new lead of last week.')}
              action={canExecute ? <Button size="sm" onClick={() => setCreating(true)}>{t('workflowPages.campaigns.new', 'New campaign')}</Button> : undefined} /></div>
          ) : (
            <ul className="divide-y dark:divide-white/10">
              {query.data.data.map((c) => {
                const total = c.progress?.total || 0;
                const done = (c.progress?.byStatus?.completed || 0) + (c.progress?.byStatus?.failed || 0) + (c.progress?.byStatus?.cancelled || 0) + (c.progress?.byStatus?.skipped || 0);
                return (
                  <li key={c._id} data-testid="campaign-row" className="flex flex-col gap-3 p-4 sm:px-5 lg:flex-row lg:items-center">
                    <Link href={`/automation/campaigns/${c._id}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="truncate font-medium hover:text-primary">{c.name}</p><CampaignStatusBadge status={c.status} /></div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{refName(c.workflowId)}{c.version ? ` · ${t('workflow.common.version', 'v{version}', { version: c.version })}` : ''} · {formatRelative(c.startedAt || c.createdAt, locale)}</p>
                      <SegmentBar className="mt-2.5" total={total} segments={Object.entries(c.progress?.byStatus || {}).map(([k, v]) => ({ key: k, value: v || 0, className: RUN_SEGMENT_CLASSES[k] || 'bg-slate-400', label: t(`workflow.runStatus.${k}`, k) }))} />
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{t('workflowPages.campaigns.progress', '{done} of {total} finished', { done, total })}</span>
                        {c.counts?.skipped ? <span className="text-amber-600 dark:text-amber-400">{t('workflowPages.campaigns.skippedCount', '{count} skipped', { count: c.counts.skipped })}</span> : null}
                        {Object.entries(c.progress?.byOutcome || {}).slice(0, 4).map(([o, n]) => <span key={o} className="inline-flex items-center gap-1"><OutcomeBadge outcome={o as never} />{formatNumber(n || 0, locale)}</span>)}
                      </div>
                    </Link>
                    {canExecute && <CampaignActions campaign={c} onAsk={confirm.ask} />}
                  </li>
                );
              })}
            </ul>
          )}
        <div className="px-4 pb-4 sm:px-5"><Pager pagination={query.data?.pagination} onPage={setPage} /></div>
      </Panel>
      {creating && <CreateCampaignDialog onClose={() => setCreating(false)} />}
      {confirm.dialog}
    </div>
  );
}

interface PickedLead { id: string; name: string; leadNumber?: string | null }

function LeadPicker({ picked, onChange }: { picked: PickedLead[]; onChange: (leads: PickedLead[]) => void }) {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(id); }, [q]);
  const results = useQuery({ queryKey: ['workflows', 'lead-picker', debounced], queryFn: () => leadApi.listLeads({ q: debounced || undefined, limit: 25 }), staleTime: 30_000 });
  const pickedIds = useMemo(() => new Set(picked.map((l) => l.id)), [picked]);
  const toggle = (lead: PickedLead) => onChange(pickedIds.has(lead.id) ? picked.filter((l) => l.id !== lead.id) : picked.length >= MAX_LEADS ? picked : [...picked, lead]);
  const rows = (results.data?.data || []).map((l) => ({ id: l.id, name: l.name, leadNumber: l.leadNumber }));
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('workflowPages.campaigns.searchLeads', 'Search leads by name, number, phone…')} className="ps-9" aria-label={t('workflowPages.campaigns.searchLeads', 'Search leads by name, number, phone…')} />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border dark:border-white/10">
        {results.isLoading ? <div className="space-y-1 p-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div> : rows.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">{t('workflowPages.campaigns.noLeads', 'No leads found')}</p>
        ) : rows.map((l) => (
          <button key={l.id} type="button" onClick={() => toggle(l)} className={cn('flex w-full items-center gap-2 border-b px-3 py-2 text-start text-sm last:border-b-0 hover:bg-muted/50 dark:border-white/10', pickedIds.has(l.id) && 'bg-primary/5')}>
            <span className={cn('grid size-4 shrink-0 place-items-center rounded border', pickedIds.has(l.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{pickedIds.has(l.id) && <Check className="size-3" />}</span>
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
            {l.leadNumber && <span className="text-xs text-muted-foreground">{l.leadNumber}</span>}
          </button>
        ))}
      </div>
      {rows.length > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...picked, ...rows.filter((l) => !pickedIds.has(l.id))].slice(0, MAX_LEADS))}>
          {t('workflowPages.campaigns.addAllShown', 'Add all {count} shown', { count: rows.length })}
        </Button>
      )}
      {picked.length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {picked.slice(0, 60).map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pe-1 ps-2.5 text-xs text-primary">
              {l.name}
              <button type="button" onClick={() => toggle(l)} aria-label={t('workflowPages.common.remove', 'Remove')} className="rounded-full p-0.5 hover:bg-primary/20"><X className="size-3" /></button>
            </span>
          ))}
          {picked.length > 60 && <span className="text-xs text-muted-foreground">+{picked.length - 60}</span>}
        </div>
      )}
    </div>
  );
}

function ChipInput({ values, onChange, options, placeholder, label }: { values: string[]; onChange: (v: string[]) => void; options?: Array<{ value: string; label: string }>; placeholder: string; label: string }) {
  const [draft, setDraft] = useState('');
  const add = (v: string) => { const s = v.trim(); if (s && !values.includes(s)) onChange([...values, s]); setDraft(''); };
  return (
    <div className="space-y-1.5">
      <Label className="">{label}</Label>
      {options ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const on = values.includes(o.value);
            return <button key={o.value} type="button" onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
              className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors dark:border-white/15', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{o.label}</button>;
          })}
        </div>
      ) : (
        <>
          <Input value={draft} placeholder={placeholder} aria-label={label} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); } }} onBlur={() => draft && add(draft)} />
          {values.length > 0 && <div className="flex flex-wrap gap-1.5">{values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pe-1 ps-2.5 text-xs">{v}<button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-background"><X className="size-3" /></button></span>
          ))}</div>}
        </>
      )}
    </div>
  );
}

const LEAD_SOURCES = ['extension', 'google_places', 'manual', 'widget', 'import', 'incoming_call'];

export function CreateCampaignDialog({ onClose, workflowId: presetWorkflow }: { onClose: () => void; workflowId?: string }) {
  const { t } = useLanguage();
  const m = useCampaignMutations();
  const { data: catalog } = useWorkflowCatalog();
  const published = useWorkflows({ status: 'published', limit: 100, sortBy: 'name', sortOrder: 'asc' });
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [workflowId, setWorkflowId] = useState(presetWorkflow || '');
  const [mode, setMode] = useState<'explicit' | 'filters'>('explicit');
  const [picked, setPicked] = useState<PickedLead[]>([]);
  const [filters, setFilters] = useState({ statuses: [] as string[], tags: [] as string[], sources: [] as string[] });
  const [startNow, setStartNow] = useState(true);

  const selection: CampaignSelection = mode === 'explicit' ? { mode, leadIds: picked.map((l) => l.id) } : { mode, filters };
  const selectionReady = mode === 'explicit' ? picked.length > 0 : Boolean(filters.statuses.length || filters.tags.length || filters.sources.length);
  const preview = useQuery({
    queryKey: ['workflows', 'campaign-preview', selection],
    queryFn: () => workflowApi.previewCampaign(selection),
    enabled: mode === 'filters' && selectionReady,
    staleTime: 10_000,
  });
  const workflow = published.data?.data.find((w) => w._id === workflowId);
  const count = mode === 'explicit' ? picked.length : preview.data?.count ?? null;

  const create = () => m.create.mutate({ name: name.trim(), workflowId, selection }, {
    onSuccess: (c) => { if (startNow) m.action.mutate({ id: c._id, action: 'start' }, { onSettled: onClose }); else onClose(); },
  });
  const canNext = [Boolean(name.trim() && workflowId), selectionReady, true][step];
  const stepTitles = [t('workflowPages.campaigns.stepSetup', 'Workflow'), t('workflowPages.campaigns.stepContacts', 'Contacts'), t('workflowPages.campaigns.stepReview', 'Review')];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('workflowPages.campaigns.new', 'New campaign')}</DialogTitle>
          <DialogDescription>{t('workflowPages.campaigns.newHint', 'Contacts that already run this workflow, are converted or merged are skipped automatically. Consent and opt-outs are re-checked before every call or message.')}</DialogDescription>
        </DialogHeader>
        <ol className="flex items-center gap-2 text-xs">
          {stepTitles.map((title, i) => (
            <li key={title} className={cn('flex flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 dark:border-white/10', i === step && 'border-primary bg-primary/5 font-semibold text-primary', i < step && 'text-emerald-600')}>
              <span className="grid size-5 place-items-center rounded-full bg-muted text-[11px]">{i < step ? <Check className="size-3" /> : i + 1}</span>{title}
            </li>
          ))}
        </ol>

        <div className="min-h-64 space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label className="" htmlFor="camp-name">{t('workflowPages.campaigns.name', 'Campaign name')}</Label>
                <Input id="camp-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} placeholder={t('workflowPages.campaigns.namePlaceholder', 'e.g. November heat-pump leads')} />
              </div>
              <div className="space-y-1.5">
                <Label className="">{t('workflowPages.campaigns.workflow', 'Published workflow')}</Label>
                <Select value={workflowId} onValueChange={setWorkflowId}>
                  <SelectTrigger aria-label={t('workflowPages.campaigns.workflow', 'Published workflow')}><SelectValue placeholder={t('workflowPages.campaigns.chooseWorkflow', 'Choose a workflow')} /></SelectTrigger>
                  <SelectContent>
                    {(published.data?.data || []).map((w) => <SelectItem key={w._id} value={w._id}>{w.name} · {t('workflow.common.version', 'v{version}', { version: w.publishedVersion })}</SelectItem>)}
                  </SelectContent>
                </Select>
                {published.data && published.data.data.length === 0 && <p className="text-xs text-amber-600">{t('workflowPages.campaigns.noPublished', 'Publish a workflow first — campaigns run published versions only.')}</p>}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(['explicit', 'filters'] as const).map((md) => (
                  <button key={md} type="button" onClick={() => setMode(md)} className={cn('flex items-center gap-2 rounded-xl border p-3 text-start text-sm dark:border-white/10', mode === md && 'border-primary bg-primary/5 ring-1 ring-primary/30')}>
                    {md === 'explicit' ? <Users className="size-4 text-primary" /> : <Filter className="size-4 text-primary" />}
                    <span><span className="block font-medium">{t(`workflowPages.campaigns.mode.${md}`, md)}</span><span className="block text-xs text-muted-foreground">{t(`workflowPages.campaigns.mode.${md}Hint`, '')}</span></span>
                  </button>
                ))}
              </div>
              {mode === 'explicit' ? <LeadPicker picked={picked} onChange={setPicked} /> : (
                <div className="space-y-4">
                  <ChipInput label={t('workflowPages.campaigns.filterStatus', 'Lead status')} values={filters.statuses} onChange={(statuses) => setFilters((f) => ({ ...f, statuses }))}
                    options={(catalog?.leadStatuses || ['new', 'contacted', 'qualified', 'unqualified', 'converted']).map((s) => ({ value: s, label: t(`workflowPages.leadStatus.${s}`, s) }))} placeholder="" />
                  <ChipInput label={t('workflowPages.campaigns.filterSource', 'Lead source')} values={filters.sources} onChange={(sources) => setFilters((f) => ({ ...f, sources }))}
                    options={LEAD_SOURCES.map((s) => ({ value: s, label: t(`workflowPages.leadSource.${s}`, s) }))} placeholder="" />
                  <ChipInput label={t('workflowPages.campaigns.filterTags', 'Tags (any)')} values={filters.tags} onChange={(tags) => setFilters((f) => ({ ...f, tags }))} placeholder={t('workflowPages.campaigns.tagsPlaceholder', 'Type a tag and press Enter')} />
                </div>
              )}
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs" data-testid="selection-count">
                {count === null ? (selectionReady ? t('workflowPages.campaigns.counting', 'Counting…') : t('workflowPages.campaigns.selectContacts', 'Choose who should enter the workflow.'))
                  : t('workflowPages.campaigns.selectedCount', '{count} contacts selected', { count })}
                {preview.data?.capped && <span className="ms-1 text-amber-600">{t('workflowPages.campaigns.capped', '(limited to the first 5,000)')}</span>}
              </p>
            </>
          )}
          {step === 2 && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border p-4 dark:border-white/10">
                <dt className="text-muted-foreground">{t('workflowPages.campaigns.name', 'Campaign name')}</dt><dd className="font-medium">{name}</dd>
                <dt className="text-muted-foreground">{t('workflowPages.campaigns.workflow', 'Published workflow')}</dt>
                <dd className="font-medium">{workflow?.name} · {t('workflow.common.version', 'v{version}', { version: workflow?.publishedVersion ?? '—' })}</dd>
                <dt className="text-muted-foreground">{t('workflowPages.campaigns.trigger', 'Trigger')}</dt><dd>{workflow?.triggerType ? t(`workflow.node.${workflow.triggerType}.label`, workflow.triggerType) : '—'}</dd>
                <dt className="text-muted-foreground">{t('workflowPages.campaigns.contacts', 'Contacts')}</dt><dd>{count ?? '—'}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">{t('workflowPages.campaigns.versionPinned', 'Every contact runs the version that is published now, even if the workflow is edited later.')}</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} className="size-4 accent-[var(--primary)]" />{t('workflowPages.campaigns.startNow', 'Start immediately')}</label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={step === 0 ? onClose : () => setStep(step - 1)} className="gap-1">
            {step > 0 && <ChevronLeft className="size-4 rtl:rotate-180" />}{step === 0 ? t('workflowPages.common.cancel', 'Cancel') : t('workflowPages.common.back', 'Back')}
          </Button>
          {step < 2 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)} className="gap-1">{t('workflowPages.common.continue', 'Continue')}<ChevronRight className="size-4 rtl:rotate-180" /></Button>
          ) : (
            <Button disabled={m.create.isPending || m.action.isPending} onClick={create}>{startNow ? t('workflowPages.campaigns.createStart', 'Create and start') : t('workflowPages.campaigns.createDraft', 'Create as draft')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
