'use client';
import { currencyDigits } from '@/shared/data/currencies';

import { CurrencyPicker } from '@/modules/accounting/components/currency-picker';
import { useAccountingCurrency } from '@/modules/accounting/state/accounting-currency';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, Scale, Wallet, CalendarDays } from 'lucide-react';
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { BankingSelect } from './banking-controls';
import styles from './banking-workspace.module.css';
import { Skeleton } from '@/components/ui/skeleton';
import { useBankAnalytics } from '../hooks/use-accounting-queries';

export const bankMoney = (n, currency = 'CHF') => new Intl.NumberFormat('de-CH', { style: 'currency', currency, minimumFractionDigits: currencyDigits(currency), maximumFractionDigits: currencyDigits(currency) }).format(n ?? 0);
export function bankRange(days = 90) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(23, 59, 59, 999);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

export function BankingAnalytics({ accounts = [], de = false, onDay, compact = false }) {
  const [days, setDays] = useState(90);
  const { currency, setCurrency } = useAccountingCurrency();
  const range = useMemo(() => bankRange(days), [days]);
  const { data, isLoading, isError, refetch } = useBankAnalytics({ ...range, currency });
  const totals = data?.totals || {};
  const fmt = (value) => bankMoney(value, currency);
  const balance = accounts.filter(a => a.currency === currency && a.status !== 'INACTIVE').reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);
  const daily = useMemo(() => {
    const map = new Map((data?.daily || []).map(row => [row.date, row]));
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(range.dateFrom);
      date.setUTCDate(date.getUTCDate() + i);
      const key = date.toISOString().slice(0, 10);
      return { date: key, inflows: 0, outflows: 0, net: 0, count: 0, ...map.get(key) };
    });
  }, [data, days, range]);
  const maxActivity = Math.max(1, ...daily.map(d => d.inflows + d.outflows));
  const reviewed = totals.count ? Math.round((totals.count - totals.unmatched) / totals.count * 100) : 0;
  const metrics = [
    { label: de ? 'Bankguthaben' : 'Cash at bank', value: balance, detail: de ? 'Aktive Konten · gewählte Währung' : 'Active accounts · selected currency', icon: Wallet, tone: '' },
    { label: de ? 'Eingänge' : 'Money in', value: totals.inflows, detail: de ? 'Importierte Gutschriften' : 'Imported credits in this period', icon: ArrowDownLeft, tone: 'text-emerald-500' },
    { label: de ? 'Ausgänge' : 'Money out', value: totals.outflows, detail: de ? 'Importierte Belastungen' : 'Imported debits in this period', icon: ArrowUpRight, tone: 'text-rose-500' },
    { label: de ? 'Netto-Cashflow' : 'Net cash flow', value: totals.net, detail: `${totals.count || 0} ${de ? 'Transaktionen' : 'transactions'}`, icon: Scale, tone: totals.net < 0 ? 'text-rose-500' : 'text-primary' },
  ];
  return <section className="min-w-0 space-y-5" aria-label={de ? 'Bankanalyse' : 'Banking analytics'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold tracking-tight">{de ? 'Liquidität im Überblick' : 'Your money, in perspective'}</h2><p className="mt-1 text-xs text-muted-foreground">{de ? 'Gebuchte Bankbewegungen · keine Währungsumrechnung' : 'Recorded bank activity · currencies are never combined'}</p></div>
      <div className={styles.filters}>
        <div className={styles.filterField}><label htmlFor="bank-analysis-currency" className={styles.filterLabel}>{de ? 'Währung' : 'Currency'}</label><CurrencyPicker id="bank-analysis-currency" label="Analysis currency" value={currency} onValueChange={setCurrency}  /></div>
        <div className={styles.filterField}><label htmlFor="bank-analysis-period" className={styles.filterLabel}>{de ? 'Zeitraum' : 'Period'}</label><BankingSelect id="bank-analysis-period" label="Analysis period" value={days} onValueChange={value => setDays(Number(value))} icon={CalendarDays} options={[30, 90, 180].map(value => ({ value, label: `${value} ${de ? 'Tage' : 'days'}` }))} /></div>
      </div>
    </div>
    {isError ? <div role="alert" className="rounded-xl border border-destructive/30 p-5 text-sm">{de ? 'Bankanalyse konnte nicht geladen werden.' : 'Banking analytics could not be loaded.'} <Button variant="outline" size="sm" onClick={() => refetch()}>{de ? 'Erneut versuchen' : 'Retry'}</Button></div> : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, tone }) => <div key={label} className={`${styles.surface} px-5 py-5`}>
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><Icon className={`size-4 ${tone || 'text-muted-foreground'}`} /></div>
          {isLoading ? <Skeleton className="my-3 h-8 w-32" /> : <p className="mt-4 break-words text-2xl font-semibold tracking-tight tabular-nums">{fmt(value)}</p>}
          <p className="mt-2 text-[11px] text-muted-foreground">{detail}</p>
        </div>)}
      </div>
      <div className={`grid min-w-0 gap-4 ${compact ? '' : 'xl:grid-cols-[minmax(0,2fr)_minmax(250px,1fr)]'}`}>
        <div className={`${styles.surface} min-w-0 p-4 sm:p-6`}>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">{de ? 'Cashflow-Verlauf' : 'Cash flow over time'}</h3><div className="flex gap-4 text-xs text-muted-foreground"><span><i className="mr-1.5 inline-block size-2 rounded-full bg-primary" />{de ? 'Eingänge' : 'Money in'}</span><span><i className="mr-1.5 inline-block size-2 rounded-full bg-rose-400" />{de ? 'Ausgänge' : 'Money out'}</span></div></div>
          {isLoading ? <Skeleton className="h-56 w-full" /> : totals.count > 0 ? <div className="h-60 min-w-0" aria-label={de ? 'Cashflow-Diagramm' : 'Cash flow chart'}>
            <ResponsiveContainer width="100%" height="100%"><ComposedChart data={daily} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
              <XAxis dataKey="date" minTickGap={45} tickFormatter={v => new Date(v).toLocaleDateString(de ? 'de-CH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={n => Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(0)}k` : n} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v, name) => [fmt(v), name === 'inflows' ? (de ? 'Eingänge' : 'Money in') : (de ? 'Ausgänge' : 'Money out')]} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--foreground)' }} />
              <Area type="monotone" dataKey="inflows" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
              <Bar dataKey="outflows" fill="var(--color-rose-400)" radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
            </ComposedChart></ResponsiveContainer>
          </div> : <div className="flex h-60 flex-col items-center justify-center text-center"><Wallet className="mb-3 size-8 text-muted-foreground/40" /><p className="text-sm font-medium">{de ? 'Noch keine Bewegungen' : 'Your cash flow starts here'}</p><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{de ? 'Importieren Sie einen Kontoauszug für diesen Zeitraum.' : 'Import a statement to see money coming in and going out for this period.'}</p></div>}
          <div className="mt-4 flex justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span>{de ? 'Netto im Zeitraum' : 'Net movement this period'}</span><span className="font-semibold text-foreground tabular-nums">{fmt(totals.net)}</span></div>
        </div>
        {!compact && <div className={`${styles.surface} p-6`}>
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{de ? 'Abstimmung' : 'Review progress'}</h3><Scale className="size-4 text-primary" /></div>
          <div className="mt-6 flex items-baseline gap-2"><strong className="text-4xl font-semibold tracking-tight tabular-nums">{reviewed}%</strong><span className="text-xs text-muted-foreground">{de ? 'bearbeitet' : 'reviewed'}</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Reviewed transactions" aria-valuenow={reviewed} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary" style={{ width: `${reviewed}%` }} /></div>
          <div className="mt-6 space-y-4 text-xs">{[['UNMATCHED', de ? 'Zu prüfen' : 'Needs review'], ['AUTO_MATCHED', de ? 'Automatisch zugeordnet' : 'Automatically matched'], ['MANUALLY_MATCHED', de ? 'Manuell zugeordnet' : 'Manually matched'], ['CATEGORIZED', de ? 'Kategorisiert' : 'Categorized']].map(([key, label]) => <div key={key} className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{data?.statuses?.find(s => s.status === key)?.count || 0}</span></div>)}</div>
          <Button asChild variant="outline" className="mt-6 w-full"><Link href="/accounting/reconciliation">{de ? 'Abstimmung öffnen' : 'Open reconciliation'}<ArrowRight className="ml-2 size-4" /></Link></Button>
        </div>}
      </div>
      {!compact && <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(250px,1fr)]">
        <div className={`${styles.surface} min-w-0 p-4 sm:p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{de ? 'Aktivitätskarte' : 'Cash activity heat map'}</h3><p className="mt-1 text-xs text-muted-foreground">{de ? 'Tagesvolumen · Tag für Details auswählen' : 'Daily volume · select a day to inspect transactions'}</p></div><span className="text-[11px] text-muted-foreground">{currency} · UTC</span></div>
          <div className="mt-5 overflow-x-auto pb-2"><div className="grid min-w-[260px] grid-flow-col grid-rows-7 gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.ceil(days / 7)}, minmax(8px, 20px))` }}>
            {daily.map(day => { const activity = day.inflows + day.outflows; const level = activity === 0 ? 0 : Math.max(1, Math.ceil(activity / maxActivity * 4)); return <button type="button" key={day.date} onClick={() => onDay?.(day.date)} disabled={!onDay} aria-label={`${day.date}: ${day.count} transactions, ${fmt(activity)}`} title={`${day.date} · ${day.count} · ${fmt(activity)}`} className={`aspect-square min-h-3 rounded-[3px] border border-border/40 outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-primary ${['bg-muted', 'bg-primary/20', 'bg-primary/40', 'bg-primary/65', 'bg-primary'][level]}`} />; })}
          </div></div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{daily[0]?.date}</span><span>{de ? 'Weniger' : 'Less'} <i className="mx-1 inline-block size-2 rounded-sm bg-muted" /><i className="mr-1 inline-block size-2 rounded-sm bg-primary/40" /><i className="mr-1 inline-block size-2 rounded-sm bg-primary" /> {de ? 'Mehr' : 'More'}</span><span>{daily.at(-1)?.date}</span></div>
        </div>
        <div className={`${styles.surface} p-6`}><h3 className="text-sm font-semibold">{de ? 'Grösste Zahlungspartner' : 'Top counterparties'}</h3><p className="mt-1 text-xs text-muted-foreground">{de ? 'Nach ausgehendem Volumen' : 'Ranked by outgoing volume'}</p><div className="mt-5 space-y-4">{data?.counterparties?.length ? data.counterparties.map((row, i) => <div key={row.name || i} className="flex min-w-0 items-center justify-between gap-3 text-xs"><span className="truncate text-muted-foreground">{row.name || (de ? 'Nicht angegeben' : 'Not provided')}</span><span className="shrink-0 font-medium tabular-nums">{fmt(row.outflows)}</span></div>) : <p className="py-5 text-xs text-muted-foreground">{de ? 'Keine Zahlungspartner im Zeitraum.' : 'No counterparties in this period.'}</p>}</div></div>
      </div>}
    </>}
  </section>;
}
