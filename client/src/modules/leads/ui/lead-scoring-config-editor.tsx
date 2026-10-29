'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Gauge, Loader2, RefreshCw, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { leadApi } from '../services/lead-api';
import { leadQualityApi } from '../services/lead-quality-api';
import { useSaveScoringConfig, useScoringConfig, useScoringPreview } from '../hooks/use-lead-quality';
import type { LeadScoringConfig, LeadScoringConfigInput, LeadScoringFactorMeta } from '../types/lead-quality-types';
import { Button, Input, Textarea, useLanguage } from './lead-ui-kit';
import { LeadScoreBadge } from './lead-score-badge';
import { factorLabel, LeadScoreExplanationView } from './lead-score-panel';

export const LEAD_SCORING_ADMIN_PERMISSION = 'lead:scoring-admin';

type Draft = LeadScoringConfigInput & { targetTypesText: string; targetCitiesText: string };

const lines = (text: string) => text.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);

export function draftFromConfig(config: LeadScoringConfig): Draft {
  return {
    bands: { ...config.bands },
    minEvidence: config.minEvidence,
    targetBusinessTypes: [...config.targetBusinessTypes],
    targetCities: [...config.targetCities],
    factors: JSON.parse(JSON.stringify(config.factors)),
    rules: config.rules,
    note: '',
    targetTypesText: config.targetBusinessTypes.join('\n'),
    targetCitiesText: config.targetCities.join('\n'),
  };
}

export function inputFromDraft(draft: Draft): LeadScoringConfigInput {
  return {
    bands: draft.bands,
    minEvidence: draft.minEvidence,
    targetBusinessTypes: lines(draft.targetTypesText),
    targetCities: lines(draft.targetCitiesText),
    factors: draft.factors,
    rules: draft.rules,
    note: draft.note || null,
  };
}

const GROUPS = ['business', 'qualification', 'engagement'];

/** `/leads/scoring` — admin editor for the versioned scoring config, with live preview. */
export function LeadScoringConfigEditor() {
  const { t } = useLanguage();
  const { hasPermission, isAdmin } = usePermissions();
  const allowed = isAdmin || hasPermission(LEAD_SCORING_ADMIN_PERMISSION);
  const configQuery = useScoringConfig(allowed);
  const save = useSaveScoringConfig();
  const preview = useScoringPreview();
  const [edited, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState('');
  const [sampleId, setSampleId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const base = useMemo(() => (configQuery.data ? draftFromConfig(configQuery.data.config) : null), [configQuery.data]);
  // Until the admin edits something, the draft IS the active config.
  const draft = edited ?? base;

  const samples = useQuery({
    queryKey: ['lead-quality', 'sample-leads', debouncedSearch],
    queryFn: () => leadApi.listLeads({ q: debouncedSearch || undefined, limit: 8 }),
    enabled: allowed,
  });

  const input = useMemo(() => (draft ? inputFromDraft(draft) : null), [draft]);
  const debouncedInput = useDebounce(input, 500);
  const bandsInvalid = Boolean(draft && draft.bands.warm > draft.bands.hot);
  const { mutate: runPreview } = preview;

  useEffect(() => {
    if (sampleId && debouncedInput && debouncedInput.bands.warm <= debouncedInput.bands.hot) {
      runPreview({ leadId: sampleId, config: debouncedInput });
    }
  }, [sampleId, debouncedInput, runPreview]);

  if (!allowed) {
    return <p className="p-6 text-[13px] text-muted-foreground">{t('leads.scoring.noAccess', 'You do not have permission to configure lead scoring.')}</p>;
  }
  if (configQuery.isLoading || !draft || !configQuery.data) {
    return <p className="flex items-center gap-2 p-6 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />…</p>;
  }

  const { config, factors } = configQuery.data;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...(d ?? draft), ...patch }));
  const setFactor = (key: string, patch: Partial<{ enabled: boolean; maxPoints: number }>) =>
    setDraft((d) => {
      const cur = d ?? draft;
      return { ...cur, factors: { ...cur.factors, [key]: { ...cur.factors[key], ...patch } } };
    });

  const onSave = () => {
    if (!input || bandsInvalid) return;
    save.mutate(input, {
      onSuccess: (res) => {
        showSuccess(t('leads.scoring.saved', 'Version v{version} saved — all leads are being rescored.', { version: res.config.version }));
        setDraft(draftFromConfig(res.config));
      },
      onError: (err) => showError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || String(err)),
    });
  };

  const onRecompute = async () => {
    try { await leadQualityApi.recomputeAll(); showSuccess(t('leads.scoring.recomputeQueued', 'Rescoring queued')); } catch (err) { showError(String((err as Error)?.message || err)); }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="space-y-5 p-4 pb-16 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm" aria-label={t('leads.title', 'Leads')}>
              <Link href="/leads"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></Link>
            </Button>
            <div className="rounded-xl bg-primary/10 p-2.5 ring-1 ring-primary/20"><Gauge className="h-5 w-5 text-primary" aria-hidden="true" /></div>
            <div>
              <h1 className="text-[18px] font-semibold text-foreground">{t('leads.scoring.title', 'Lead scoring')}</h1>
              <p className="max-w-2xl text-[13px] text-muted-foreground">{t('leads.scoring.subtitle', 'Deterministic, versioned weights and rules. Every change creates a new version and rescores all leads.')}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t('leads.scoring.activeVersion', 'Active version v{version}', { version: config.version })}
                {config.source === 'default' ? ` (${t('leads.scoring.defaults', 'built-in defaults')})` : ''}
                {config.recompute ? ` · ${t('leads.scoring.recomputeStatus', 'Last recompute: {status} ({processed} leads)', { status: config.recompute.status, processed: config.recompute.processed })}` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-9 gap-2" onClick={onRecompute}><RefreshCw className="h-4 w-4" aria-hidden="true" />{t('leads.scoring.recomputeAll', 'Rescore all leads')}</Button>
            <Button className="h-9 gap-2 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white" onClick={onSave} disabled={save.isPending || bandsInvalid}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {t('leads.scoring.save', 'Save as new version')}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <h2 className="mb-3 text-[13px] font-semibold">{t('leads.scoring.bands', 'Bands')}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField label={t('leads.scoring.hotFrom', 'Hot from score')} value={draft.bands.hot} min={1} max={100} onChange={(v) => set({ bands: { ...draft.bands, hot: v } })} />
                <NumberField label={t('leads.scoring.warmFrom', 'Warm from score')} value={draft.bands.warm} min={0} max={100} onChange={(v) => set({ bands: { ...draft.bands, warm: v } })} />
                <NumberField label={t('leads.scoring.minEvidence', 'Minimum evidenced factors (otherwise unscored)')} value={draft.minEvidence} min={0} max={20} onChange={(v) => set({ minEvidence: v })} />
              </div>
              {bandsInvalid && <p role="alert" className="mt-2 text-[12px] text-destructive">{t('leads.scoring.invalidBands', 'Warm must not be above Hot.')}</p>}
            </section>

            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <h2 className="mb-1 text-[13px] font-semibold">{t('leads.scoring.targets', 'Targets')}</h2>
              <p className="mb-3 text-[12px] text-muted-foreground">{t('leads.scoring.targetsHint', 'Leave empty to skip the factor.')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-[12px]">
                  <span className="text-muted-foreground">{t('leads.scoring.targetTypes', 'Target business types (one per line)')}</span>
                  <Textarea rows={4} value={draft.targetTypesText} onChange={(e) => set({ targetTypesText: e.target.value })} />
                </label>
                <label className="space-y-1 text-[12px]">
                  <span className="text-muted-foreground">{t('leads.scoring.targetCities', 'Target cities (one per line)')}</span>
                  <Textarea rows={4} value={draft.targetCitiesText} onChange={(e) => set({ targetCitiesText: e.target.value })} />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <h2 className="mb-3 text-[13px] font-semibold">{t('leads.scoring.weights', 'Factor weights')}</h2>
              {GROUPS.map((group) => (
                <div key={group} className="mb-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t(`leads.score.group.${group}`, group)}</p>
                  <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                    {factors.filter((f: LeadScoringFactorMeta) => f.group === group).map((f) => (
                      <li key={f.key} className="flex items-center justify-between gap-3 px-3 py-2" data-factor={f.key}>
                        <label className="flex items-center gap-2 text-[13px]">
                          <input type="checkbox" checked={draft.factors[f.key]?.enabled ?? true} onChange={(e) => setFactor(f.key, { enabled: e.target.checked })} aria-label={`${factorLabel(t, f)} ${t('leads.scoring.enabled', 'Enabled')}`} />
                          {factorLabel(t, f)}
                        </label>
                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {f.penalty ? t('leads.scoring.penaltyPoints', 'Penalty points') : t('leads.scoring.maxPoints', 'Max points')}
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            className="h-8 w-20"
                            value={draft.factors[f.key]?.maxPoints ?? 0}
                            onChange={(e) => setFactor(f.key, { maxPoints: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                            aria-label={`${factorLabel(t, f)} ${t('leads.scoring.maxPoints', 'Max points')}`}
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <label className="mt-2 block space-y-1 text-[12px]">
                <span className="text-muted-foreground">{t('leads.scoring.note', 'Change note')}</span>
                <Input value={draft.note ?? ''} maxLength={500} onChange={(e) => set({ note: e.target.value })} />
              </label>
            </section>
          </div>

          <aside className="space-y-3 lg:sticky lg:top-0 lg:self-start">
            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <h2 className="text-[13px] font-semibold">{t('leads.scoring.preview', 'Live preview')}</h2>
              <p className="mb-2 text-[12px] text-muted-foreground">{t('leads.scoring.previewHint', 'Pick a sample lead to compare the active config with your draft.')}</p>
              <Input placeholder={t('leads.scoring.sampleSearch', 'Search a sample lead')} value={search} onChange={(e) => setSearch(e.target.value)} />
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border/60" role="listbox">
                {(samples.data?.data ?? []).map((lead) => (
                  <li key={lead.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={sampleId === lead.id}
                      onClick={() => setSampleId(lead.id)}
                      className={cn('flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-[12px] hover:bg-muted/60', sampleId === lead.id && 'bg-primary/5 text-primary')}
                    >
                      <span className="truncate">{lead.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{lead.leadNumber}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {preview.isPending && <p className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />…</p>}
              {preview.data && sampleId && (
                <div className="mt-3 space-y-3" data-testid="scoring-preview">
                  <div className="grid grid-cols-2 gap-2">
                    {([['current', t('leads.scoring.current', 'Active')], ['preview', t('leads.scoring.draft', 'Draft')]] as const).map(([k, title]) => (
                      <div key={k} className="rounded-xl border border-border/60 p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
                        <p className="text-[22px] font-bold tabular-nums">{preview.data[k].score}</p>
                        <LeadScoreBadge score={{ value: preview.data[k].score, band: preview.data[k].band, version: preview.data[k].version, computedAt: null, disqualified: preview.data[k].disqualified, factors: [] }} />
                      </div>
                    ))}
                  </div>
                  <LeadScoreExplanationView data={preview.data.preview} />
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="space-y-1 text-[12px]">
      <span className="block text-muted-foreground">{label}</span>
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
    </label>
  );
}
