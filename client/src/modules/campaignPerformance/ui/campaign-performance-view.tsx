'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { BadgeDollarSign, Download, Info, Loader2, RefreshCw, Target, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { downloadBlob } from '@/lib/api/download';
import { showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAttributionReport } from '../hooks/use-attribution';
import { attributionApi } from '../services/attribution-api';
import type { AttributionGroupBy, AttributionModel, AttributionParams, AttributionReport, AttributionRow } from '../types/attribution-types';

// Validated categorical palette shared with the AI-calling cost charts.
export const PALETTE = { spend: '#3b82f6', cost: '#d97706', revenue: '#0891b2', loss: '#db2777' } as const;

const RANGES = ['7', '30', '90', '365'] as const;
const GROUPS: AttributionGroupBy[] = ['campaign', 'channel', 'agent'];
const MODELS: AttributionModel[] = ['linear', 'first', 'last'];
const CURRENCIES = ['CHF', 'EUR', 'USD'];

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

export const formatMoney = (value: number | null | undefined, currency: string) => {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
};
const formatCredit = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

/** Display name of a group key (campaign / channel / agent). */
export function groupLabel(row: Pick<AttributionRow, 'key' | 'label'>, groupBy: AttributionGroupBy, t: Translate): string {
  if (row.label) return row.label;
  if (groupBy === 'channel') return t(`campaignPerformance.channel.${row.key}`, row.key);
  if (row.key === 'manual') return t('campaignPerformance.group.manual', 'Manual contact (no campaign)');
  if (row.key === 'none') return t('campaignPerformance.group.none', 'No campaign');
  if (row.key === 'unassigned') return t('campaignPerformance.group.unassigned', 'Unassigned');
  if (row.key.startsWith('source:')) return t('campaignPerformance.group.source', 'Lead source: {source}', { source: row.key.slice(7) });
  return t('campaignPerformance.group.unnamed', 'Unnamed ({id})', { id: row.key.split(':').pop()?.slice(-6) ?? row.key });
}

function rangeParams(range: string) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (Number(range) - 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

function Segmented<T extends string>({ label, value, options, onChange, render }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; render: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-border bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${value === option ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {render(option)}
        </button>
      ))}
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><span className="text-sky-600 dark:text-sky-400">{icon}</span>{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CampaignPerformanceView() {
  const { t } = useLanguage();
  const [range, setRange] = useState<(typeof RANGES)[number]>('30');
  const [groupBy, setGroupBy] = useState<AttributionGroupBy>('campaign');
  const [model, setModel] = useState<AttributionModel>('linear');
  const [currency, setCurrency] = useState('CHF');
  const [includeDiscovery, setIncludeDiscovery] = useState(false);
  const [exporting, setExporting] = useState(false);
  const params = useMemo<AttributionParams>(() => ({ ...rangeParams(range), groupBy, model, currency, includeDiscovery }), [range, groupBy, model, currency, includeDiscovery]);
  const query = useAttributionReport(params);
  const data = query.data;
  const notRecorded = t('campaignPerformance.notRecorded', 'not recorded');

  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadBlob(await attributionApi.exportCsv(params), `campaign-performance-${groupBy}-${range}d.csv`, 'text/csv;charset=utf-8');
    } catch (error) { showError(error); } finally { setExporting(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label={t('campaignPerformance.range', 'Period')} value={range} options={RANGES} onChange={setRange} render={(v) => t('campaignPerformance.days', '{n} days', { n: v })} />
        <Segmented label={t('campaignPerformance.groupBy', 'Group by')} value={groupBy} options={GROUPS} onChange={setGroupBy} render={(v) => t(`campaignPerformance.groupBy.${v}`, v)} />
        <Segmented label={t('campaignPerformance.model', 'Attribution model')} value={model} options={MODELS} onChange={setModel} render={(v) => t(`campaignPerformance.model.${v}`, v)} />
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="h-8 w-24" aria-label={t('campaignPerformance.currency', 'Currency')}><SelectValue /></SelectTrigger>
          <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch className="" checked={includeDiscovery} onCheckedChange={setIncludeDiscovery} />
          {t('campaignPerformance.includeDiscovery', 'Count lead discovery as a touch')}
        </label>
        <div className="ms-auto">
          <Button variant="outline" size="sm" disabled={exporting || !data?.rows.length} onClick={() => void exportCsv()}>
            {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}{t('campaignPerformance.export', 'Export CSV')}
          </Button>
        </div>
      </div>

      {!data ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-16 text-sm text-muted-foreground">
          {query.isError ? (
            <span role="alert" className="flex items-center gap-3">{t('campaignPerformance.error', 'Campaign performance could not be loaded.')}
              <Button size="sm" variant="outline" onClick={() => void query.refetch()}><RefreshCw aria-hidden />{t('common.retry', 'Retry')}</Button>
            </span>
          ) : <><Loader2 className="size-4 animate-spin" aria-hidden />{t('common.loading', 'Loading…')}</>}
        </div>
      ) : !data.totals.touches ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          {t('campaignPerformance.empty', 'No calls, messages or contacts were recorded in this period.')}
        </div>
      ) : (
        <div className={`space-y-5 transition-opacity ${query.isFetching ? 'opacity-70' : ''}`}>
          <Totals data={data} t={t} notRecorded={notRecorded} />
          <div className="grid gap-5 xl:grid-cols-2">
            <SpendRevenueChart data={data} t={t} />
            <CostPerQualifiedChart data={data} t={t} />
          </div>
          <Timeline data={data} t={t} />
          <PerformanceTable data={data} t={t} notRecorded={notRecorded} />
          <Notes data={data} t={t} />
        </div>
      )}
    </div>
  );
}

function Totals({ data, t, notRecorded }: { data: AttributionReport; t: Translate; notRecorded: string }) {
  const tot = data.totals;
  const c = data.currency;
  const m = (v: number | null) => formatMoney(v, c) ?? notRecorded;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi icon={<BadgeDollarSign className="size-3.5" />} label={t('campaignPerformance.kpi.spend', 'Recorded spend')} value={m(tot.spend)} hint={tot.excluded.touchesCostNotRecorded ? t('campaignPerformance.kpi.spendExcluded', '{n} touches without recorded cost', { n: tot.excluded.touchesCostNotRecorded }) : undefined} />
      <Kpi icon={<Users className="size-3.5" />} label={t('campaignPerformance.kpi.touched', 'Leads touched')} value={String(tot.leadsTouched)} hint={t('campaignPerformance.kpi.touches', '{n} touches', { n: tot.touches })} />
      <Kpi icon={<Target className="size-3.5" />} label={t('campaignPerformance.kpi.qualified', 'Qualified')} value={String(tot.qualifiedLeads)} hint={t('campaignPerformance.kpi.cpq', 'Cost per qualified: {v}', { v: m(tot.costPerQualifiedLead) })} />
      <Kpi icon={<Target className="size-3.5" />} label={t('campaignPerformance.kpi.converted', 'Converted')} value={String(tot.convertedLeads)} hint={t('campaignPerformance.kpi.cpc', 'Cost per conversion: {v}', { v: m(tot.costPerConversion) })} />
      <Kpi icon={<TrendingUp className="size-3.5" />} label={t('campaignPerformance.kpi.revenue', 'Recorded revenue')} value={m(tot.revenue)} hint={tot.excluded.conversionsRevenueNotRecorded ? t('campaignPerformance.kpi.revenueExcluded', '{n} conversions without invoices', { n: tot.excluded.conversionsRevenueNotRecorded }) : undefined} />
      <Kpi icon={<TrendingUp className="size-3.5" />} label={t('campaignPerformance.kpi.profit', 'Profit')} value={m(tot.profit)} hint={tot.roi === null ? undefined : t('campaignPerformance.kpi.roi', 'ROI {v}', { v: `${Math.round(tot.roi * 100)}%` })} />
    </div>
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <span className="block h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={label}>
      <span className="block h-full rounded-full" style={{ width: `${max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0}%`, background: color }} />
    </span>
  );
}

function SpendRevenueChart({ data, t }: { data: AttributionReport; t: Translate }) {
  const rows = data.rows.slice(0, 8);
  const max = Math.max(1e-9, ...rows.flatMap((r) => [r.spend ?? 0, r.revenue ?? 0]));
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="cp-spend-revenue">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="cp-spend-revenue" className="text-sm font-semibold">{t('campaignPerformance.chart.spendRevenue', 'Spend vs. attributed revenue')}</h3>
        <span className="flex gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: PALETTE.spend }} />{t('campaignPerformance.col.spend', 'Spend')}</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: PALETTE.revenue }} />{t('campaignPerformance.col.revenue', 'Revenue')}</span>
        </span>
      </div>
      <ul className="space-y-3">
        {rows.map((row) => {
          const name = groupLabel(row, data.groupBy, t);
          return (
            <li key={row.key} className="space-y-1">
              <p className="flex justify-between gap-2 text-xs"><span className="truncate">{name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{formatMoney(row.spend, data.currency) ?? '—'} / {formatMoney(row.revenue, data.currency) ?? '—'}</span></p>
              <Bar value={row.spend ?? 0} max={max} color={PALETTE.spend} label={`${name}: ${t('campaignPerformance.col.spend', 'Spend')} ${formatMoney(row.spend, data.currency) ?? '—'}`} />
              <Bar value={row.revenue ?? 0} max={max} color={PALETTE.revenue} label={`${name}: ${t('campaignPerformance.col.revenue', 'Revenue')} ${formatMoney(row.revenue, data.currency) ?? '—'}`} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CostPerQualifiedChart({ data, t }: { data: AttributionReport; t: Translate }) {
  const rows = data.rows.filter((r) => r.costPerQualifiedLead !== null).slice(0, 8);
  const max = Math.max(1e-9, ...rows.map((r) => r.costPerQualifiedLead ?? 0));
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="cp-cpq">
      <h3 id="cp-cpq" className="mb-3 text-sm font-semibold">{t('campaignPerformance.chart.cpq', 'Cost per qualified lead')}</h3>
      {!rows.length ? (
        <p className="text-xs text-muted-foreground">{t('campaignPerformance.chart.cpqEmpty', 'No group has both recorded spend and a qualified lead in this period.')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const name = groupLabel(row, data.groupBy, t);
            const value = formatMoney(row.costPerQualifiedLead, data.currency) ?? '—';
            return (
              <li key={row.key} className="space-y-1">
                <p className="flex justify-between gap-2 text-xs"><span className="truncate">{name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{value}</span></p>
                <Bar value={row.costPerQualifiedLead ?? 0} max={max} color={PALETTE.cost} label={`${name}: ${value}`} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Timeline({ data, t }: { data: AttributionReport; t: Translate }) {
  const days = data.timeline;
  const max = Math.max(1e-9, ...days.map((d) => d.spend ?? 0));
  if (!days.length) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="cp-timeline">
      <h3 id="cp-timeline" className="mb-3 text-sm font-semibold">{t('campaignPerformance.chart.daily', 'Daily recorded spend')}</h3>
      <div className="flex h-28 items-end gap-[2px]" role="img" aria-label={t('campaignPerformance.chart.daily', 'Daily recorded spend')}>
        {days.map((d) => (
          <span
            key={d.date}
            title={`${d.date}: ${formatMoney(d.spend, data.currency) ?? '—'} · ${d.touches}`}
            className="min-w-[3px] flex-1 rounded-t"
            style={{ height: `${d.spend ? Math.max((d.spend / max) * 100, 3) : 2}%`, background: d.spend === null ? PALETTE.loss : PALETTE.spend, opacity: d.spend ? 1 : 0.35 }}
          />
        ))}
      </div>
      <p className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{days[0].date}</span><span>{days[days.length - 1].date}</span></p>
    </section>
  );
}

function PerformanceTable({ data, t, notRecorded }: { data: AttributionReport; t: Translate; notRecorded: string }) {
  const c = data.currency;
  const cell = (v: number | null) => formatMoney(v, c) ?? <span className="text-muted-foreground">{notRecorded}</span>;
  const rows = [...data.rows, { ...data.totals, key: '__total', label: t('campaignPerformance.total', 'Total') }];
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {['group', 'touched', 'qualified', 'converted', 'spend', 'cpq', 'cpc', 'revenue', 'profit', 'excluded'].map((col) => (
              <th key={col} scope="col" className="px-3 py-2 text-start font-medium">{t(`campaignPerformance.col.${col}`, col)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const total = row.key === '__total';
            const ex = row.excluded;
            const notes = [
              ex.touchesCostNotRecorded ? t('campaignPerformance.ex.cost', '{n} without cost', { n: ex.touchesCostNotRecorded }) : null,
              ex.conversionsRevenueNotRecorded ? t('campaignPerformance.ex.revenue', '{n} without revenue', { n: ex.conversionsRevenueNotRecorded }) : null,
              ex.currenciesWithoutRate.length ? t('campaignPerformance.ex.rate', 'no rate: {c}', { c: ex.currenciesWithoutRate.join(', ') }) : null,
            ].filter(Boolean);
            return (
              <tr key={row.key} className={total ? 'bg-muted/30 font-semibold' : undefined}>
                <td className="max-w-[240px] truncate px-3 py-2">{total ? row.label : groupLabel(row, data.groupBy, t)}</td>
                <td className="px-3 py-2 tabular-nums">{row.leadsTouched}</td>
                <td className="px-3 py-2 tabular-nums">{total ? row.qualifiedLeads : formatCredit(row.qualifiedCredit)}</td>
                <td className="px-3 py-2 tabular-nums">{total ? row.convertedLeads : formatCredit(row.convertedCredit)}</td>
                <td className="px-3 py-2 tabular-nums">{cell(row.spend)}</td>
                <td className="px-3 py-2 tabular-nums">{row.costPerQualifiedLead === null ? '—' : formatMoney(row.costPerQualifiedLead, c)}</td>
                <td className="px-3 py-2 tabular-nums">{row.costPerConversion === null ? '—' : formatMoney(row.costPerConversion, c)}</td>
                <td className="px-3 py-2 tabular-nums">{cell(row.revenue)}</td>
                <td className="px-3 py-2 tabular-nums" style={row.profit !== null && row.profit < 0 ? { color: PALETTE.loss } : undefined}>
                  {cell(row.profit)}{row.roi !== null && <span className="ms-1 text-xs font-normal text-muted-foreground">({Math.round(row.roi * 100)}%)</span>}
                </td>
                <td className="px-3 py-2 text-xs font-normal text-muted-foreground">{notes.length ? notes.join(' · ') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Notes({ data, t }: { data: AttributionReport; t: Translate }) {
  const missingRates = data.exchangeRates.filter((r) => r.missing).map((r) => `${r.from}→${r.to}`);
  return (
    <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
      <p className="flex items-center gap-2 font-medium text-foreground"><Info className="size-3.5" aria-hidden />{t('campaignPerformance.notes.title', 'How these numbers are built')}</p>
      <p>{t(`campaignPerformance.notes.model.${data.model}`, data.model)} {t('campaignPerformance.notes.credit', 'Qualified and converted columns show attributed credit; spend is the recorded cost of each group\'s own touches.')}</p>
      <p>{t('campaignPerformance.notes.revenue', 'Revenue is the net invoiced amount (excl. VAT) of customers converted from these leads. Nothing is estimated: missing costs, revenue or exchange rates are shown as "not recorded" and counted.')}</p>
      {!data.assumptions.simSmsCostRecorded && <p>{t('campaignPerformance.notes.simSms', 'SIM SMS cost is not recorded (SIM_SMS_COST_PER_MESSAGE is not set).')}</p>}
      {missingRates.length > 0 && <p>{t('campaignPerformance.notes.rates', 'No recorded exchange rate for {pairs}; add one in Accounting to include those amounts.', { pairs: missingRates.join(', ') })}</p>}
      {data.excluded.leadsTouchedOnlyAfterConversion > 0 && <p>{t('campaignPerformance.notes.afterConversion', '{n} converted lead(s) were only touched after converting and get no credit.', { n: data.excluded.leadsTouchedOnlyAfterConversion })}</p>}
      {data.excluded.touchesOutsideLeadScope > 0 && <p>{t('campaignPerformance.notes.scope', '{n} touches on leads outside your access are not shown.', { n: data.excluded.touchesOutsideLeadScope })}</p>}
      {data.excluded.truncatedSources.length > 0 && <p className="text-amber-600 dark:text-amber-400">{t('campaignPerformance.notes.truncated', 'Very large period: some sources were capped ({s}). Narrow the period for exact totals.', { s: data.excluded.truncatedSources.join(', ') })}</p>}
    </div>
  );
}

export default CampaignPerformanceView;
