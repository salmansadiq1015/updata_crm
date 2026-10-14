'use client';

import { useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { showError } from '@/lib/toast';
import { downloadBlob } from '@/lib/api/download';
import { aiCallingApi } from '../services/ai-calling-api';
import { useAnalytics } from '../hooks/use-ai-calling';

const DISPOSITION_COLORS: Record<string, string> = {
  answered_completed: 'bg-emerald-500', answered_partial: 'bg-amber-500', callback_requested: 'bg-blue-500',
  declined: 'bg-muted-foreground/40', do_not_contact: 'bg-rose-500', no_answer: 'bg-muted-foreground/30',
  busy: 'bg-muted-foreground/30', voicemail: 'bg-muted-foreground/30', failed: 'bg-rose-400', needs_review: 'bg-rose-500',
};

export function AnalyticsPanel() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const params = { ...(from ? { from: `${from}T00:00:00.000Z` } : {}), ...(to ? { to: `${to}T23:59:59.999Z` } : {}) };
  const { data } = useAnalytics(params);

  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await aiCallingApi.analyticsCsv(params);
      downloadBlob(blob, 'ai-calling-analytics.csv', 'text/csv;charset=utf-8');
    } catch (e) { showError(e); } finally { setExporting(false); }
  }

  if (!data) return null;
  const dispositions = [...data.byDisposition].filter((d) => d._id).sort((a, b) => b.count - a.count);
  const maxDisp = Math.max(1, ...dispositions.map((d) => d.count));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-brand-500" /> Analytics</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-muted-foreground">From <input type="date" className="rounded-md border border-border bg-background px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="flex items-center gap-1 text-muted-foreground">To <input type="date" className="rounded-md border border-border bg-background px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" onClick={exportCsv} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-60">
            <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'CSV'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rates */}
        <div className="space-y-3">
          <Rate label="Answer rate" value={data.answerRate} sub={`${data.answered}/${data.totalCalls} calls`} color="text-emerald-600" />
          <Rate label="Qualification rate" value={data.qualificationRate} sub={`${data.qualified} qualified`} color="text-brand-600" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="Calls" value={data.totalCalls} />
            <Mini label="Callbacks" value={data.callbacks} />
            <Mini label="Reviews" value={data.reviews} />
          </div>
          <Trend series={data.byDay} />
        </div>

        {/* Disposition breakdown */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Outcomes</p>
          {!dispositions.length ? (
            <p className="text-sm text-muted-foreground">No calls in this range.</p>
          ) : (
            <ul className="space-y-1.5">
              {dispositions.map((d) => (
                <li key={d._id} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 truncate text-muted-foreground">{String(d._id).replace(/_/g, ' ')}</span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className={`block h-full rounded-full ${DISPOSITION_COLORS[String(d._id)] || 'bg-brand-500'}`} style={{ width: `${(d.count / maxDisp) * 100}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right font-medium tabular-nums">{d.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Rate({ label, value, sub, color }: { label: string; value: number | null; sub: string; color: string }) {
  return (
    <div className="flex items-end justify-between border-b border-border/50 pb-2">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value != null ? `${Math.round(value * 100)}%` : '—'}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Minimal inline-SVG calls-per-day sparkline (no chart dependency). */
function Trend({ series }: { series: Array<{ date: string; calls: number; qualified: number }> }) {
  if (series.length < 2) return null;
  const w = 280; const h = 44; const max = Math.max(1, ...series.map((d) => d.calls));
  const step = w / (series.length - 1);
  const pts = (key: 'calls' | 'qualified') => series.map((d, i) => `${(i * step).toFixed(1)},${(h - (d[key] / max) * h).toFixed(1)}`).join(' ');
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Calls per day</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Calls per day trend" preserveAspectRatio="none">
        <polyline points={pts('calls')} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-500" />
        <polyline points={pts('qualified')} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500" strokeDasharray="3 2" />
      </svg>
      <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3 rounded bg-brand-500" /> calls</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3 rounded bg-emerald-500" /> qualified</span>
      </div>
    </div>
  );
}
