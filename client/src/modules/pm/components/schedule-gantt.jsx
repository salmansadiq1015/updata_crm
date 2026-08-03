'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Milestone } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
// Zoom levels → pixel width of a single day column.
const ZOOM = { day: 30, week: 15, month: 6 };
const BAR_COLORS = ['#7C5CFC', '#22A06B', '#E8833A', '#4472C4', '#E5484D', '#0EA5E9', '#B45309', '#9333EA'];

const dateOnly = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => { const x = dateOnly(d); return addDays(x, -((x.getDay() + 6) % 7)); };
const daysBetween = (a, b) => Math.round((dateOnly(b) - dateOnly(a)) / DAY_MS);

function isoWeek(d) {
  const x = dateOnly(d);
  x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));
  const week1 = new Date(x.getFullYear(), 0, 4);
  return 1 + Math.round(((x - week1) / DAY_MS - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
const chShort = (d) => new Date(d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });

const STATUS_RING = {
  COMPLETED: 'ring-emerald-500', IN_PROGRESS: 'ring-amber-500',
  CANCELLED: 'ring-red-500', WAIVED: 'ring-slate-400', PLANNED: 'ring-transparent',
};

/**
 * Weekly Gantt for the project Terminplan: KW columns, one bar per phase,
 * milestones as diamonds, and dependency arrows drawn from a phase's
 * predecessor (predecessorId) to its start.
 */
export function ScheduleGantt({ entries = [], onEditEntry }) {
  const { language } = useLanguage();
  const [zoom, setZoom] = useState('week');
  const dayW = ZOOM[zoom];
  const ROW_H = 40;
  const LABEL_W = 210;
  const HEADER_H = 34;

  const model = useMemo(() => {
    const dates = entries.flatMap((e) => (e.entryType === 'PHASE'
      ? [e.startDate, e.endDate]
      : [e.milestoneDate])).filter(Boolean).map((d) => dateOnly(d));
    if (!dates.length) return null;
    const min = mondayOf(new Date(Math.min(...dates)));
    const maxRaw = new Date(Math.max(...dates));
    const max = addDays(mondayOf(maxRaw), 6);
    const totalDays = daysBetween(min, max) + 1;
    const rows = [...entries].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      || new Date(a.startDate || a.milestoneDate || 0) - new Date(b.startDate || b.milestoneDate || 0));
    const rowIndex = new Map(rows.map((e, i) => [String(e._id), i]));
    // Week columns
    const weeks = [];
    for (let m = new Date(min); m <= max; m = addDays(m, 7)) {
      weeks.push({ monday: new Date(m), x: daysBetween(min, m) * dayW });
    }
    const dayX = (d) => daysBetween(min, d) * dayW;
    return { min, max, totalDays, rows, rowIndex, weeks, dayX, gridW: totalDays * dayW };
  }, [entries, dayW]);

  if (!model) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{language === 'de' ? 'Keine datierten Termine' : 'No dated entries'}</p>;
  }

  const { rows, rowIndex, weeks, dayX, gridW } = model;
  const bodyH = rows.length * ROW_H;

  // Dependency arrows: predecessor right edge → successor left edge.
  const arrows = [];
  for (const e of rows) {
    if (!e.predecessorId) continue;
    const predId = String(e.predecessorId._id || e.predecessorId);
    if (!rowIndex.has(predId) || !rowIndex.has(String(e._id))) continue;
    const pred = rows[rowIndex.get(predId)];
    if (pred.entryType !== 'PHASE' || !pred.endDate) continue;
    const startD = e.entryType === 'PHASE' ? e.startDate : e.milestoneDate;
    if (!startD) continue;
    const x1 = dayX(pred.endDate) + dayW;
    const y1 = rowIndex.get(predId) * ROW_H + ROW_H / 2;
    const x2 = dayX(startD);
    const y2 = rowIndex.get(String(e._id)) * ROW_H + ROW_H / 2;
    arrows.push({ x1, y1, x2, y2, key: String(e._id) });
  }

  const todayX = dayX(new Date());
  const withinToday = todayX >= 0 && todayX <= gridW;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {language === 'de' ? 'Balken = Phasen · Rauten = Meilensteine · Pfeile = Abhängigkeiten' : 'Bars = phases · Diamonds = milestones · Arrows = dependencies'}
        </span>
        <div className="flex items-center overflow-hidden rounded-lg border border-border text-xs">
          {['day', 'week', 'month'].map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={cn('px-2.5 py-1 font-medium transition-colors', zoom === z ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
            >
              {z === 'day' ? (language === 'de' ? 'Tag' : 'Day') : z === 'week' ? (language === 'de' ? 'Woche' : 'Week') : (language === 'de' ? 'Monat' : 'Month')}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-theme-sm">
        <div className="flex min-w-max">
          {/* Left labels */}
          <div className="shrink-0 border-r border-border" style={{ width: LABEL_W }}>
            <div className="border-b border-border bg-muted/40 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ height: HEADER_H, lineHeight: `${HEADER_H}px` }}>
              {language === 'de' ? 'Aufgabe / Termin' : 'Task / entry'}
            </div>
            {rows.map((e) => (
              <button
                key={e._id}
                type="button"
                onClick={() => onEditEntry?.(e)}
                className="flex w-full items-center gap-2 border-b border-border/60 px-3 text-left text-[13px] hover:bg-muted/40"
                style={{ height: ROW_H }}
                title={e.name}
              >
                {e.entryType === 'MILESTONE' && <Milestone className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                <span className="truncate">{e.name}</span>
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="relative" style={{ width: gridW }}>
            {/* Week header */}
            <div className="relative border-b border-border bg-muted/40" style={{ height: HEADER_H }}>
              {weeks.map((w, i) => (
                <div key={i} className="absolute top-0 border-l border-border/60 px-1.5 pt-1 text-[10px] leading-tight text-muted-foreground" style={{ left: w.x, width: 7 * dayW, height: HEADER_H }}>
                  <div className="font-semibold text-foreground">KW {isoWeek(w.monday)}</div>
                  {zoom !== 'month' && <div>{chShort(w.monday)}</div>}
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="relative" style={{ height: bodyH }}>
              {/* week gridlines */}
              {weeks.map((w, i) => (
                <div key={i} className="absolute top-0 bottom-0 border-l border-border/40" style={{ left: w.x }} />
              ))}
              {/* today marker */}
              {withinToday && (
                <div className="absolute top-0 bottom-0 z-20 w-px bg-red-400" style={{ left: todayX }}>
                  <span className="absolute -top-0.5 left-1 text-[9px] font-medium text-red-500">{language === 'de' ? 'Heute' : 'Today'}</span>
                </div>
              )}

              {/* dependency arrows */}
              <svg className="pointer-events-none absolute inset-0 z-10 overflow-visible" width={gridW} height={bodyH}>
                <defs>
                  <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
                  </marker>
                </defs>
                {arrows.map((a) => {
                  const midX = Math.max(a.x1 + 8, a.x2 - 8);
                  const d = `M ${a.x1} ${a.y1} H ${midX} V ${a.y2} H ${a.x2}`;
                  return <path key={a.key} d={d} fill="none" stroke="#94a3b8" strokeWidth="1.3" markerEnd="url(#gantt-arrow)" />;
                })}
              </svg>

              {/* bars / milestones */}
              {rows.map((e, i) => {
                const y = i * ROW_H;
                if (e.entryType === 'MILESTONE') {
                  if (!e.milestoneDate) return null;
                  const x = dayX(e.milestoneDate) + dayW / 2;
                  return (
                    <button
                      key={e._id}
                      type="button"
                      onClick={() => onEditEntry?.(e)}
                      className="absolute z-10 rotate-45 rounded-[2px] bg-amber-500 ring-2 ring-card hover:bg-amber-600"
                      style={{ left: x - 7, top: y + ROW_H / 2 - 7, width: 14, height: 14 }}
                      title={`${e.name} · ${chShort(e.milestoneDate)}`}
                    />
                  );
                }
                if (!e.startDate || !e.endDate) return null;
                const left = dayX(e.startDate);
                const width = Math.max(dayW, (daysBetween(e.startDate, e.endDate) + 1) * dayW);
                const color = BAR_COLORS[i % BAR_COLORS.length];
                return (
                  <button
                    key={e._id}
                    type="button"
                    onClick={() => onEditEntry?.(e)}
                    className={cn('absolute z-10 flex items-center overflow-hidden rounded-md px-2 text-[11px] font-medium text-white ring-1 hover:brightness-110', STATUS_RING[e.status] || 'ring-transparent')}
                    style={{ left, top: y + 7, width, height: ROW_H - 14, backgroundColor: color }}
                    title={`${e.name} · ${chShort(e.startDate)}–${chShort(e.endDate)}`}
                  >
                    <span className="truncate">{e.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
