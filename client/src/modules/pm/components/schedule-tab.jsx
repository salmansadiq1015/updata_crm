'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { queryKeys } from '@/lib/query/keys';
import { scheduleService } from '@/modules/pm/services/schedule-service';
import { useScheduleMutations } from '@/modules/pm/hooks/use-schedule-mutations';
import { createEntrySchema, updateEntrySchema, sendConfirmationSchema, updateConfirmationSchema } from '@/modules/pm/validations/schedule';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  SCHEDULE_ENTRY_TYPE_CONFIG, SCHEDULE_STATUS_CONFIG,
  RESPONSIBLE_TYPE_CONFIG, CONFIRMATION_STATUS_CONFIG,
} from '@/modules/pm/constants/pm-constants';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { showError } from '@/lib/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { FormField, FormBody } from '@/components/ui/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { customerService } from '@/modules/crm/services/customer-service';
import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';
import {
  Plus, Pencil, Trash2, Loader2, ArrowRight, Milestone,
  Send, MessageSquare, Calendar, Users, Building2,
  List, BarChart3, ChevronDown, ChevronRight, Clock, Download,
  User, Check, AlertTriangle, CheckSquare, Square, X, FileText,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

// ── Form pickers (mirror project-filter-bar.jsx patterns) ───────

/** Internal-team picker backed by the users list endpoint. */
function InternalUserPicker({ value, onChange, language }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: users = [], isFetching } = useUserDirectory({
    enabled: true,
    search: debouncedSearch,
    limit: 80,
  });
  const selected = users.find((u) => u._id === value) || null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm text-left transition-colors hover:bg-accent/40"
        >
          <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selected ? `${selected.firstName} ${selected.lastName}` : (language === 'de' ? 'Mitarbeiter wählen' : 'Select team member')}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 shadow-lg" align="start">
        <div className="px-2 pt-2 pb-1.5 border-b">
          <Input
            placeholder={language === 'de' ? 'Suchen...' : 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          <button
            type="button"
            className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-accent', !value && 'bg-accent/50')}
            onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
          >
            <span className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center shrink-0">
              <User className="h-3 w-3 text-muted-foreground/60" />
            </span>
            <span className="text-muted-foreground">{language === 'de' ? 'Keine' : 'None'}</span>
            {!value && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </button>
          {users.map((u) => (
            <button
              type="button"
              key={u._id}
              className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-accent', u._id === value && 'bg-accent/50')}
              onClick={() => { onChange(u._id); setOpen(false); setSearch(''); }}
            >
              <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[9px] font-semibold flex items-center justify-center shrink-0">
                {u.firstName?.[0]}{u.lastName?.[0]}
              </span>
              <span className="truncate">{u.firstName} {u.lastName}</span>
              {u._id === value && <Check className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
          {isFetching && users.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              {language === 'de' ? 'Benutzer werden geladen...' : 'Loading users...'}
            </p>
          )}
          {!isFetching && users.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              {language === 'de' ? 'Keine Nutzer gefunden' : 'No users found'}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Partner-company picker — reuses customerService.searchCustomers. */
function PartnerCompanyPicker({ value, onChange, language }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: customers = [] } = useQuery({
    queryKey: queryKeys.crm.customers.search(debouncedSearch),
    queryFn: () => customerService.searchCustomers(debouncedSearch, 20),
    enabled: debouncedSearch.length >= 2,
  });

  const { data: selectedCustomerData } = useQuery({
    queryKey: ['customerName', value],
    queryFn: async () => {
      if (!value) return null;
      return customerService.getCustomerById(value);
    },
    enabled: !!value,
    staleTime: 60000,
  });

  const displayName = customers.find((c) => c._id === value)?.name || selectedCustomerData?.name || null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm text-left transition-colors hover:bg-accent/40"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {displayName ?? (language === 'de' ? 'Partnerfirma wählen' : 'Select partner company')}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 shadow-lg" align="start">
        <div className="px-2 pt-2 pb-1.5 border-b">
          <Input
            placeholder={language === 'de' ? 'Firma suchen...' : 'Search company...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          <button
            type="button"
            className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-accent', !value && 'bg-accent/50')}
            onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
          >
            <span className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center shrink-0">
              <Building2 className="h-3 w-3 text-muted-foreground/60" />
            </span>
            <span className="text-muted-foreground">{language === 'de' ? 'Keine' : 'None'}</span>
            {!value && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </button>
          {customers.map((c) => (
            <button
              type="button"
              key={c._id}
              className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-accent', c._id === value && 'bg-accent/50')}
              onClick={() => { onChange(c._id); setOpen(false); setSearch(''); }}
            >
              <Building2 className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              <span className="truncate">{c.name}</span>
              {c._id === value && <Check className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
          {debouncedSearch.length < 2 && customers.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              {language === 'de' ? 'Mind. 2 Zeichen eingeben' : 'Type at least 2 characters'}
            </p>
          )}
          {debouncedSearch.length >= 2 && customers.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              {language === 'de' ? 'Keine Firmen gefunden' : 'No companies found'}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Timeline visualization ──────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Start/end (ms) for an entry, whichever kind. Milestones are zero-width. */
function entryRange(entry) {
  if (entry.entryType === 'PHASE') {
    return { start: new Date(entry.startDate).getTime(), end: new Date(entry.endDate).getTime() };
  }
  const t = new Date(entry.milestoneDate).getTime();
  return { start: t, end: t };
}

/**
 * Client-side conflict check. Returns a Map<entryId, string[]> of human-readable
 * reasons. Two checks (lightweight, advisory — never blocks a move):
 *  1. Predecessor violation: an entry starts before its predecessor's end.
 *  2. Sibling overlap: two entries with the same responsible party (team member
 *     or partner company) have overlapping date ranges.
 */
function computeConflicts(entries, language) {
  const de = language === 'de';
  const conflicts = new Map();
  const add = (id, msg) => {
    const list = conflicts.get(id) || [];
    list.push(msg);
    conflicts.set(id, list);
  };
  const byId = new Map(entries.map((e) => [e._id, e]));

  for (const entry of entries) {
    const r = entryRange(entry);
    if (isNaN(r.start) || isNaN(r.end)) continue;

    // 1. Predecessor relationship: must start on/after predecessor's end.
    if (entry.predecessorId) {
      const pred = byId.get(entry.predecessorId);
      if (pred) {
        const pr = entryRange(pred);
        if (!isNaN(pr.end) && r.start < pr.end) {
          add(entry._id, de
            ? `Beginnt vor Ende des Vorgängers „${pred.name}"`
            : `Starts before predecessor "${pred.name}" ends`);
        }
      }
    }

    // 2. Sibling overlap with the same responsible party.
    const party = entry.partnerCompanyId || entry.responsibleTeamId;
    if (!party) continue;
    for (const other of entries) {
      if (other._id === entry._id) continue;
      const otherParty = other.partnerCompanyId || other.responsibleTeamId;
      if (otherParty !== party) continue;
      const or = entryRange(other);
      if (isNaN(or.start) || isNaN(or.end)) continue;
      // Overlap if ranges intersect (strict, so back-to-back is fine).
      if (r.start < or.end && or.start < r.end) {
        add(entry._id, de
          ? `Überschneidung mit „${other.name}" (gleiche Zuständigkeit)`
          : `Overlaps "${other.name}" (same responsible party)`);
        break;
      }
    }
  }
  return conflicts;
}

function ScheduleTimeline({ entries, language, canWrite, serverConflicts, onReschedule, onEditEntry }) {
  const containerRef = useRef(null);
  const [timelineNow] = useState(() => Date.now());
  // Local drag state: { id, kind, deltaDays, startX } while dragging; null otherwise.
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);

  // Keep a ref in sync so pointer move/up handlers (bound once) read fresh values.
  useEffect(() => { dragRef.current = drag; }, [drag]);

  // Prefer authoritative server conflicts when available; otherwise fall back to
  // the lightweight client-side computation (both produce Map<entryId, string[]>).
  const clientConflicts = useMemo(() => computeConflicts(entries, language), [entries, language]);
  const conflicts = serverConflicts && serverConflicts.size > 0 ? serverConflicts : clientConflicts;

  const allDates = useMemo(() => entries.flatMap((e) => {
    if (e.entryType === 'PHASE') return [new Date(e.startDate), new Date(e.endDate)];
    return [new Date(e.milestoneDate)];
  }).filter((d) => !isNaN(d)), [entries]);

  if (entries.length === 0 || allDates.length === 0) return null;

  const minTime = Math.min(...allDates.map((d) => d.getTime()));
  const maxTime = Math.max(...allDates.map((d) => d.getTime()));
  const range = maxTime - minTime || DAY_MS;

  const todayPos = ((timelineNow - minTime) / range) * 100;
  const toPercent = (dateStr) => ((new Date(dateStr).getTime() - minTime) / range) * 100;

  // Convert a horizontal pixel delta into a whole-day delta using the live scale:
  // (px / containerWidthPx) * rangeMs → ms, snapped to whole days. The container's
  // rendered width maps 1:1 to `range`, so this inverts the date→x mapping exactly.
  const pxToDays = (deltaPx) => {
    const width = containerRef.current?.offsetWidth || 1;
    const deltaMs = (deltaPx / width) * range;
    return Math.round(deltaMs / DAY_MS);
  };

  const DRAG_THRESHOLD_PX = 4; // below this, treat as a tap (don't reschedule)

  const beginDrag = (e, entry) => {
    if (!canWrite) return;
    e.preventDefault();
    const startX = e.clientX;
    setDrag({ id: entry._id, kind: entry.entryType, startX, deltaDays: 0, moved: false });

    const handleMove = (ev) => {
      const deltaPx = ev.clientX - startX;
      const deltaDays = pxToDays(deltaPx);
      const moved = Math.abs(ev.clientX - startX) > DRAG_THRESHOLD_PX;
      setDrag((d) => (d ? { ...d, deltaDays, deltaPx, moved } : d));
    };

    const handleUp = (ev) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      const cur = dragRef.current;
      setDrag(null);
      if (!cur) return;
      const movedPx = Math.abs(ev.clientX - startX);
      if (movedPx <= DRAG_THRESHOLD_PX) {
        // Treated as a tap → open the edit dialog (accessible fallback).
        onEditEntry?.(entry);
        return;
      }
      if (!cur.deltaDays) return; // dragged but not far enough to shift a full day
      const shiftMs = cur.deltaDays * DAY_MS;
      if (entry.entryType === 'PHASE') {
        const newStart = new Date(new Date(entry.startDate).getTime() + shiftMs);
        const newEnd = new Date(new Date(entry.endDate).getTime() + shiftMs);
        onReschedule?.(entry, {
          startDate: newStart.toISOString().split('T')[0],
          endDate: newEnd.toISOString().split('T')[0],
        });
      } else {
        const newDate = new Date(new Date(entry.milestoneDate).getTime() + shiftMs);
        onReschedule?.(entry, { milestoneDate: newDate.toISOString().split('T')[0] });
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  // Visual offset (in %) applied to the bar currently being dragged.
  const dragOffsetPercent = (entry) => {
    if (!drag || drag.id !== entry._id || !drag.moved) return 0;
    return ((drag.deltaDays * DAY_MS) / range) * 100;
  };

  const hasConflicts = conflicts.size > 0;

  return (
    <div className="space-y-2">
      {(canWrite || hasConflicts) && (
        <div className="flex items-center gap-4 px-1 text-[11px] text-muted-foreground flex-wrap">
          {canWrite && (
            <span>{language === 'de' ? 'Balken ziehen, um Termine zu verschieben' : 'Drag a bar to reschedule'}</span>
          )}
          {hasConflicts && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-destructive inline-block" />
              {language === 'de' ? 'Terminkonflikt' : 'Schedule conflict'}
            </span>
          )}
        </div>
      )}

      <div className="relative rounded-xl border border-border bg-card p-6 shadow-theme-sm overflow-x-auto">
        <div ref={containerRef} className="relative min-w-[600px]" style={{ height: entries.length * 48 + 32 }}>
          {/* Today marker */}
          {todayPos >= 0 && todayPos <= 100 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
              style={{ left: `${todayPos}%` }}
            >
              <span className="absolute -top-5 -translate-x-1/2 text-[10px] text-red-500 font-medium whitespace-nowrap">
                {language === 'de' ? 'Heute' : 'Today'}
              </span>
            </div>
          )}

          {entries.map((entry, idx) => {
            const statusCfg = SCHEDULE_STATUS_CONFIG[entry.status];
            const y = idx * 48 + 16;
            const reasons = conflicts.get(entry._id);
            const conflicted = !!reasons;
            const offset = dragOffsetPercent(entry);
            const isDragging = drag?.id === entry._id && drag.moved;
            const conflictTitle = reasons?.join(' • ');

            if (entry.entryType === 'PHASE') {
              const left = toPercent(entry.startDate);
              const right = toPercent(entry.endDate);
              const width = Math.max(right - left, 1);

              return (
                <div
                  key={entry._id}
                  className="absolute flex items-center"
                  style={{ top: y, left: `calc(${left}% + ${offset}%)`, width: `${width}%`, height: 32, zIndex: isDragging ? 20 : undefined }}
                >
                  <div
                    onPointerDown={(e) => beginDrag(e, entry)}
                    title={conflictTitle}
                    className={cn(
                      'h-7 w-full rounded-md flex items-center px-2 text-xs font-medium truncate border select-none',
                      statusCfg?.bgColor || 'bg-muted', statusCfg?.textColor || 'text-foreground',
                      statusCfg?.borderColor || 'border-border',
                      canWrite && 'cursor-grab active:cursor-grabbing touch-none',
                      isDragging && 'shadow-lg ring-2 ring-primary/50',
                      conflicted && 'ring-2 ring-destructive',
                    )}
                  >
                    {conflicted && <AlertTriangle className="h-3 w-3 mr-1 shrink-0 text-destructive" />}
                    {entry.name}
                  </div>
                </div>
              );
            }

            const pos = toPercent(entry.milestoneDate);
            return (
              <div
                key={entry._id}
                className="absolute flex items-center gap-1"
                style={{ top: y, left: `calc(${pos}% + ${offset}%)`, transform: 'translateX(-50%)', zIndex: isDragging ? 20 : undefined }}
              >
                <div
                  onPointerDown={(e) => beginDrag(e, entry)}
                  title={conflictTitle}
                  className={cn(
                    'h-5 w-5 rotate-45 rounded-sm border select-none',
                    statusCfg?.bgColor, statusCfg?.borderColor || 'border-border',
                    canWrite && 'cursor-grab active:cursor-grabbing touch-none',
                    isDragging && 'shadow-lg ring-2 ring-primary/50',
                    conflicted && 'ring-2 ring-destructive',
                  )}
                />
                <span className="text-[11px] font-medium whitespace-nowrap inline-flex items-center gap-1">
                  {conflicted && <AlertTriangle className="h-3 w-3 text-destructive" />}
                  {entry.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Entry card (list view) ──────────────────────────────────────

// Open the generated appointment-confirmation PDF (PROJ-004 AC-3). The
// confirmation links a doctpl GeneratedDocument via documentId.
async function openGeneratedPdf(documentId) {
  try {
    const url = await scheduleService.getGeneratedDocumentDownloadUrl(documentId);
    if (url) window.open(url, '_blank', 'noopener');
  } catch {
    // download errors surface via the api client interceptor
  }
}

function EntryCard({ entry, language, canWrite, onEdit, onDelete, onSendConfirmation, onUpdateConfirmation, conflictReasons, selectMode, selected, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false);
  const typeCfg = SCHEDULE_ENTRY_TYPE_CONFIG[entry.entryType];
  const statusCfg = SCHEDULE_STATUS_CONFIG[entry.status];
  const responsibleCfg = RESPONSIBLE_TYPE_CONFIG[entry.responsibleType];
  const TypeIcon = typeCfg?.icon || ArrowRight;
  const isPartner = entry.responsibleType === 'PARTNER_COMPANY';
  const selectable = isPartner && entry.partnerCompanyId;

  const dateLabel = entry.entryType === 'PHASE'
    ? `${formatDate(entry.startDate)} – ${formatDate(entry.endDate)}`
    : formatDate(entry.milestoneDate);

  const confirmations = entry.confirmations || [];

  return (
    <div className={cn('rounded-lg border bg-card shadow-theme-sm transition-all hover:shadow-theme-md', selected && 'ring-2 ring-primary')}>
      <div className="flex items-center gap-3 p-4">
        {selectMode && (
          <Checkbox
            checked={selected}
            disabled={!selectable}
            onCheckedChange={() => selectable && onToggleSelect?.(entry)}
            className="shrink-0"
            aria-label={language === 'de' ? 'Auswählen' : 'Select'}
          />
        )}
        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', statusCfg?.bgColor || 'bg-muted')}>
          <TypeIcon className={cn('h-4 w-4', statusCfg?.textColor || 'text-muted-foreground')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{entry.name}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {language === 'de' ? typeCfg?.label : typeCfg?.labelEn}
            </Badge>
            {conflictReasons?.length > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[10px] text-destructive"
                title={conflictReasons.join(' • ')}
              >
                <AlertTriangle className="h-3 w-3" />
                {language === 'de' ? 'Konflikt' : 'Conflict'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className={cn('inline-flex items-center gap-1', statusCfg?.textColor)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', statusCfg?.dotColor)} />
              {language === 'de' ? statusCfg?.label : statusCfg?.labelEn}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {dateLabel}
            </span>
            {responsibleCfg && (
              <span className="flex items-center gap-1">
                {isPartner ? <Building2 className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {language === 'de' ? responsibleCfg.label : responsibleCfg.labelEn}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isPartner && canWrite && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSendConfirmation(entry)} title={language === 'de' ? 'Bestätigung senden' : 'Send Confirmation'}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
          {canWrite && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => onDelete(entry)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {confirmations.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Confirmations panel */}
      {expanded && confirmations.length > 0 && (
        <div className="border-t px-4 py-3 space-y-2 bg-muted/30">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
            {language === 'de' ? 'Bestätigungen' : 'Confirmations'}
          </p>
          {confirmations.map((conf) => {
            const confCfg = CONFIRMATION_STATUS_CONFIG[conf.confirmationStatus];
            return (
              <div key={conf._id} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', confCfg?.dotColor)} />
                  <span className="truncate">{conf.partnerContactEmail}</span>
                  <span className={cn('text-[10px]', confCfg?.textColor)}>
                    {language === 'de' ? confCfg?.label : confCfg?.labelEn}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {conf.documentId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => openGeneratedPdf(conf.documentId)}
                      title={language === 'de' ? 'Bestätigungs-PDF ansehen' : 'View confirmation PDF'}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      PDF
                    </Button>
                  )}
                  {canWrite && conf.confirmationStatus === 'SENT' && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => onUpdateConfirmation(entry, conf)}>
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {language === 'de' ? 'Antwort' : 'Respond'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main tab component ──────────────────────────────────────────

export function ScheduleTab({ projectId }) {
  const { t, language } = useLanguage();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('projects:write');

  const [viewMode, setViewMode] = useState('list');
  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const entryBodyRef = useRef(null);
  const [entryScrollRequest, setEntryScrollRequest] = useState(0);

  // Confirmation dialogs
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmSendEntry, setConfirmSendEntry] = useState(null);
  const [confirmResponseOpen, setConfirmResponseOpen] = useState(false);
  const [confirmResponseEntry, setConfirmResponseEntry] = useState(null);
  const [confirmResponseConf, setConfirmResponseConf] = useState(null);

  // Multi-select + bulk confirmation
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkEmails, setBulkEmails] = useState({}); // entryId -> email

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: queryKeys.pm.schedule.byProject(projectId),
    queryFn: () => scheduleService.getSchedule(projectId),
    enabled: !!projectId,
  });

  const entries = useMemo(() => {
    const raw = scheduleData?.entries || scheduleData || [];
    return Array.isArray(raw) ? raw : [];
  }, [scheduleData]);

  // Server-side conflict detection (advisory, non-blocking).
  const { data: conflictsData } = useQuery({
    queryKey: queryKeys.pm.schedule.conflicts(projectId),
    queryFn: () => scheduleService.getConflicts(projectId),
    enabled: !!projectId,
  });

  // Map<entryId, string[]> of localized reasons, derived from the server result.
  const serverConflicts = useMemo(() => {
    const map = new Map();
    const list = conflictsData?.conflicts || [];
    const byId = new Map(entries.map((e) => [e._id, e]));
    const de = language === 'de';
    for (const c of list) {
      const reasons = (c.reasons || []).map((r) => {
        const other = r.otherEntryId ? byId.get(r.otherEntryId) : null;
        const name = other?.name || (de ? 'anderem Eintrag' : 'another entry');
        if (r.type === 'predecessor_violation') {
          return de ? `Beginnt vor Ende des Vorgängers „${name}"` : `Starts before predecessor "${name}" ends`;
        }
        return de ? `Überschneidung mit „${name}" (gleiche Zuständigkeit)` : `Overlaps "${name}" (same responsible party)`;
      });
      map.set(c.entryId, reasons);
    }
    return map;
  }, [conflictsData, entries, language]);

  const { addEntry, updateEntry, deleteEntry, sendConfirmation, updateConfirmation, sendBulkConfirmations, exportSchedule } = useScheduleMutations(projectId, {
    onAddEntry: () => { setFormOpen(false); entryForm.reset(defaultEntryValues); },
    onUpdateEntry: () => { setFormOpen(false); setEditEntry(null); },
    onDeleteEntry: () => setDeleteTarget(null),
    onSendConfirmation: () => { setConfirmSendOpen(false); setConfirmSendEntry(null); },
    onUpdateConfirmation: () => { setConfirmResponseOpen(false); setConfirmResponseEntry(null); setConfirmResponseConf(null); },
    onBulkConfirmation: (res) => { setBulkResults(res?.results || []); },
  });

  // ── Multi-select / bulk confirmation helpers ──────────────────
  const selectablePartnerEntries = useMemo(
    () => entries.filter((e) => e.responsibleType === 'PARTNER_COMPANY' && e.partnerCompanyId),
    [entries],
  );

  const toggleSelect = useCallback((entry) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entry._id)) next.delete(entry._id); else next.add(entry._id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectedEntries = useMemo(
    () => entries.filter((e) => selectedIds.has(e._id) && e.partnerCompanyId),
    [entries, selectedIds],
  );

  const openBulkDialog = () => {
    setBulkResults(null);
    // Prefill each selected entry's email from the most recent confirmation, if any.
    const seed = {};
    for (const e of selectedEntries) {
      const lastEmail = (e.confirmations || [])[0]?.partnerContactEmail || '';
      seed[e._id] = lastEmail;
    }
    setBulkEmails(seed);
    setBulkOpen(true);
  };

  const allBulkEmailsValid = selectedEntries.length > 0
    && selectedEntries.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((bulkEmails[e._id] || '').trim()));

  const submitBulk = (acknowledgeShortNotice = false) => {
    const items = selectedEntries.map((e) => ({
      entryId: e._id,
      partnerCompanyId: e.partnerCompanyId,
      partnerContactEmail: (bulkEmails[e._id] || '').trim().toLowerCase(),
      partnerName: e.partnerName || '',
      ...(acknowledgeShortNotice ? { acknowledgeShortNotice: true } : {}),
    }));
    sendBulkConfirmations.mutate(items);
  };

  const shortNoticeResults = (bulkResults || []).filter((r) => r.status === 'short_notice');

  // ── Entry form ──────────────────────────────────────────────

  const isEdit = !!editEntry;
  const defaultEntryValues = { name: '', entryType: 'PHASE', startDate: '', endDate: '', milestoneDate: '', responsibleType: 'INTERNAL_TEAM', responsibleTeamId: null, partnerCompanyId: null, predecessorId: null, notes: '', sortOrder: 0 };

  const entryForm = useForm({
    resolver: zodResolver(isEdit ? updateEntrySchema : createEntrySchema),
    defaultValues: defaultEntryValues,
  });

  const watchEntryType = entryForm.watch('entryType');

  // Predecessor options: project's other entries (exclude self to avoid a self-reference).
  const predecessorOptions = useMemo(
    () => entries.filter((e) => !editEntry || e._id !== editEntry._id),
    [entries, editEntry],
  );

  const openCreateEntry = () => {
    setEditEntry(null);
    entryForm.reset(defaultEntryValues);
    setFormOpen(true);
  };

  const openEditEntry = (entry) => {
    setEditEntry(entry);
    entryForm.reset({
      name: entry.name || '',
      entryType: entry.entryType,
      startDate: entry.startDate ? new Date(entry.startDate).toISOString().split('T')[0] : '',
      endDate: entry.endDate ? new Date(entry.endDate).toISOString().split('T')[0] : '',
      milestoneDate: entry.milestoneDate ? new Date(entry.milestoneDate).toISOString().split('T')[0] : '',
      responsibleType: entry.responsibleType || 'INTERNAL_TEAM',
      responsibleTeamId: entry.responsibleTeamId || null,
      partnerCompanyId: entry.partnerCompanyId || null,
      predecessorId: entry.predecessorId || null,
      status: entry.status,
      notes: entry.notes || '',
      sortOrder: entry.sortOrder ?? 0,
    });
    setFormOpen(true);
  };

  const onEntrySubmit = (data) => {
    const cleaned = { ...data };
    if (cleaned.entryType === 'PHASE') { delete cleaned.milestoneDate; }
    else { delete cleaned.startDate; delete cleaned.endDate; }
    if (!cleaned.notes) delete cleaned.notes;

    // Keep only the responsible-party id matching the selected type.
    if (cleaned.responsibleType === 'INTERNAL_TEAM') cleaned.partnerCompanyId = null;
    else if (cleaned.responsibleType === 'PARTNER_COMPANY') cleaned.responsibleTeamId = null;

    if (isEdit) {
      updateEntry.mutate({ entryId: editEntry._id, data: cleaned });
    } else {
      addEntry.mutate(cleaned);
    }
  };

  // Surface validation failures: the required fields (name, dates) sit above the
  // fold, so without this the Create button looks dead when they're empty. Toast
  // the first error and scroll the body up to it.
  const onEntryInvalid = (errors) => {
    const first = Object.values(errors)[0];
    showError(first?.message || (language === 'de' ? 'Bitte Pflichtfelder ausfüllen.' : 'Please fill in the required fields.'));
    setEntryScrollRequest((value) => value + 1);
  };

  useEffect(() => {
    if (!entryScrollRequest) return;
    entryBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [entryScrollRequest]);

  // ── Send confirmation form ─────────────────────────────────

  const [shortNotice, setShortNotice] = useState(null); // { businessDays, leadDays } when under lead-time

  const sendForm = useForm({
    resolver: zodResolver(sendConfirmationSchema),
    defaultValues: { partnerContactEmail: '', partnerCompanyId: '', partnerName: '' },
  });

  const openSendConfirmation = (entry) => {
    setConfirmSendEntry(entry);
    setShortNotice(null);
    sendForm.reset({
      partnerContactEmail: '',
      partnerCompanyId: entry.partnerCompanyId || '',
      partnerName: '',
    });
    setConfirmSendOpen(true);
  };

  const onSendConfirmationSubmit = (data, acknowledge = false) => {
    sendConfirmation.mutate(
      { entryId: confirmSendEntry._id, data: { ...data, ...(acknowledge ? { acknowledgeShortNotice: true } : {}) } },
      {
        onError: (err) => {
          // Soft warning from the server: under lead-time and not acknowledged.
          if (err?.data?.shortNotice) {
            setShortNotice({ businessDays: err.data.businessDays, leadDays: err.data.leadDays });
          }
        },
      },
    );
  };

  // ── Update confirmation response ───────────────────────────

  const responseForm = useForm({
    resolver: zodResolver(updateConfirmationSchema),
    defaultValues: { confirmationStatus: 'CONFIRMED', responseNotes: '' },
  });
  const responseStatus = useWatch({ control: responseForm.control, name: 'confirmationStatus' });

  const openUpdateConfirmation = (entry, conf) => {
    setConfirmResponseEntry(entry);
    setConfirmResponseConf(conf);
    responseForm.reset({ confirmationStatus: 'CONFIRMED', responseNotes: '' });
    setConfirmResponseOpen(true);
  };

  const onResponseSubmit = (data) => {
    updateConfirmation.mutate({
      entryId: confirmResponseEntry._id,
      confId: confirmResponseConf._id,
      data,
    });
  };

  // ── Stats ──────────────────────────────────────────────────

  const phases = entries.filter((e) => e.entryType === 'PHASE');
  const milestones = entries.filter((e) => e.entryType === 'MILESTONE');
  const completedCount = entries.filter((e) => e.status === 'COMPLETED').length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <ArrowRight className="h-4 w-4 text-blue-500" />
            <span className="font-medium">{phases.length}</span>
            <span className="text-muted-foreground">{language === 'de' ? 'Phasen' : 'Phases'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Milestone className="h-4 w-4 text-amber-500" />
            <span className="font-medium">{milestones.length}</span>
            <span className="text-muted-foreground">{language === 'de' ? 'Meilensteine' : 'Milestones'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-emerald-500" />
            <span className="font-medium">{completedCount}/{entries.length}</span>
            <span className="text-muted-foreground">{language === 'de' ? 'abgeschlossen' : 'completed'}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button
                className="px-2.5 py-1.5 text-xs font-medium bg-card hover:bg-muted transition-colors"
                onClick={() => exportSchedule.mutate('ical')}
                disabled={exportSchedule.isPending}
                title="iCal (.ics)"
              >
                <Calendar className="h-3.5 w-3.5" />
              </button>
              <button
                className="px-2.5 py-1.5 text-xs font-medium bg-card hover:bg-muted transition-colors"
                onClick={() => exportSchedule.mutate('pdf')}
                disabled={exportSchedule.isPending}
                title="PDF"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              className={cn('px-2.5 py-1.5 text-xs font-medium transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              className={cn('px-2.5 py-1.5 text-xs font-medium transition-colors', viewMode === 'timeline' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
              onClick={() => setViewMode('timeline')}
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
          </div>

          {canWrite && selectablePartnerEntries.length > 0 && viewMode === 'list' && (
            selectMode ? (
              <Button size="sm" variant="outline" onClick={exitSelectMode}>
                <X className="h-4 w-4 mr-1.5" />
                {language === 'de' ? 'Auswahl beenden' : 'Done'}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setSelectMode(true)}>
                <CheckSquare className="h-4 w-4 mr-1.5" />
                {language === 'de' ? 'Mehrfachauswahl' : 'Select'}
              </Button>
            )
          )}

          {canWrite && (
            <Button size="sm" onClick={openCreateEntry}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t('pm.addPhase', 'Add Entry')}
            </Button>
          )}
        </div>
      </div>

      {/* ── Bulk-select action bar ─────────────────────────── */}
      {selectMode && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{selectedIds.size}</span>
            <span className="text-muted-foreground">
              {language === 'de' ? 'Partner-Termine ausgewählt' : 'partner appointments selected'}
            </span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setSelectedIds(new Set(selectablePartnerEntries.map((e) => e._id)))}
            >
              {language === 'de' ? 'Alle' : 'Select all'}
            </button>
            {selectedIds.size > 0 && (
              <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setSelectedIds(new Set())}>
                {language === 'de' ? 'Zurücksetzen' : 'Clear'}
              </button>
            )}
          </div>
          <Button size="sm" disabled={selectedIds.size === 0} onClick={openBulkDialog}>
            <Send className="h-4 w-4 mr-1.5" />
            {language === 'de' ? 'Bestätigungen senden' : 'Send confirmations'}
          </Button>
        </div>
      )}

      {/* Content */}
      {entries.length === 0 ? (
        <EmptyState
          title={t('pm.schedule', 'Schedule')}
          description={language === 'de' ? 'Noch keine Einträge erstellt.' : 'No schedule entries created yet.'}
        />
      ) : viewMode === 'timeline' ? (
        <ScheduleTimeline
          entries={entries}
          language={language}
          canWrite={canWrite}
          serverConflicts={serverConflicts}
          onEditEntry={canWrite ? openEditEntry : undefined}
          onReschedule={(entry, dates) => updateEntry.mutate({ entryId: entry._id, data: dates })}
        />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry._id}
              entry={entry}
              language={language}
              canWrite={canWrite}
              onEdit={openEditEntry}
              onDelete={setDeleteTarget}
              onSendConfirmation={openSendConfirmation}
              onUpdateConfirmation={openUpdateConfirmation}
              conflictReasons={serverConflicts.get(entry._id)}
              selectMode={selectMode}
              selected={selectedIds.has(entry._id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* ── Entry form dialog ──────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) { setFormOpen(false); setEditEntry(null); } else setFormOpen(v); }}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/15 shrink-0">
                <Calendar className="h-5 w-5 text-primary" />
              </span>
              <span className="text-base font-semibold">
                {isEdit ? t('pm.editEntry', 'Edit Entry') : t('pm.addPhase', 'Add Entry')}
              </span>
            </DialogTitle>
            <DialogDescription className="pl-[52px] -mt-1">
              {language === 'de' ? 'Phase oder Meilenstein für den Bauzeitenplan.' : 'Add a phase or milestone to the construction schedule.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={entryForm.handleSubmit(onEntrySubmit, onEntryInvalid)} className="flex flex-1 flex-col min-h-0 overflow-hidden">
            <div ref={entryBodyRef} className="px-6 py-5 flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                <FormField label={language === 'de' ? 'Typ' : 'Type'}>
                  <Select value={watchEntryType} onValueChange={(v) => entryForm.setValue('entryType', v)} disabled={isEdit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SCHEDULE_ENTRY_TYPE_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={language === 'de' ? 'Verantwortlich' : 'Responsible'}>
                  <Select
                    value={entryForm.watch('responsibleType')}
                    onValueChange={(v) => {
                      entryForm.setValue('responsibleType', v);
                      // Reset the opposite party's id when switching type.
                      if (v === 'INTERNAL_TEAM') entryForm.setValue('partnerCompanyId', null);
                      else entryForm.setValue('responsibleTeamId', null);
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RESPONSIBLE_TYPE_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                {/* Responsible-party picker (internal team member or partner company) — full width */}
                <div className="sm:col-span-2">
                  <Controller
                    name={entryForm.watch('responsibleType') === 'PARTNER_COMPANY' ? 'partnerCompanyId' : 'responsibleTeamId'}
                    control={entryForm.control}
                    render={({ field }) => (
                      <FormField label={entryForm.watch('responsibleType') === 'PARTNER_COMPANY'
                        ? (language === 'de' ? 'Partnerfirma' : 'Partner Company')
                        : (language === 'de' ? 'Teammitglied' : 'Team Member')}>
                        {entryForm.watch('responsibleType') === 'PARTNER_COMPANY' ? (
                          <PartnerCompanyPicker value={field.value || null} onChange={field.onChange} language={language} />
                        ) : (
                          <InternalUserPicker value={field.value || null} onChange={field.onChange} language={language} />
                        )}
                      </FormField>
                    )}
                  />
                </div>

                <div className="sm:col-span-2">
                  <FormField label={language === 'de' ? 'Name' : 'Name'} required error={entryForm.formState.errors.name?.message}>
                    <Input {...entryForm.register('name')} placeholder={language === 'de' ? 'z.B. Rohbauphase' : 'e.g. Foundation Phase'} />
                  </FormField>
                </div>

                {watchEntryType === 'PHASE' ? (
                  <>
                    <FormField label={t('pm.startDate', 'Start Date')} required error={entryForm.formState.errors.startDate?.message}>
                      <Input type="date" {...entryForm.register('startDate')} />
                    </FormField>
                    <FormField label={t('pm.endDate', 'End Date')} required error={entryForm.formState.errors.endDate?.message}>
                      <Input type="date" {...entryForm.register('endDate')} />
                    </FormField>
                  </>
                ) : (
                  <FormField label={t('pm.milestoneDate', 'Milestone Date')} required error={entryForm.formState.errors.milestoneDate?.message}>
                    <Input type="date" {...entryForm.register('milestoneDate')} />
                  </FormField>
                )}

                {/* Predecessor: other entries in this project (cascades on date move) */}
                <FormField label={language === 'de' ? 'Vorgänger' : 'Predecessor'}>
                  <Select
                    value={entryForm.watch('predecessorId') || 'none'}
                    onValueChange={(v) => entryForm.setValue('predecessorId', v === 'none' ? null : v)}
                  >
                    <SelectTrigger><SelectValue placeholder={language === 'de' ? 'Kein Vorgänger' : 'No predecessor'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{language === 'de' ? 'Kein Vorgänger' : 'No predecessor'}</SelectItem>
                      {predecessorOptions.map((e) => (
                        <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label={language === 'de' ? 'Sortierung' : 'Sort Order'}>
                  <Input type="number" min={0} {...entryForm.register('sortOrder')} />
                </FormField>

                {isEdit && (
                  <div className="sm:col-span-2">
                    <FormField label={t('pm.status', 'Status')}>
                      <Select value={entryForm.watch('status')} onValueChange={(v) => entryForm.setValue('status', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SCHEDULE_STATUS_CONFIG).map(([key, cfg]) => (
                            <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <FormField label={t('pm.notes', 'Notes')}>
                    <Controller
                      name="notes"
                      control={entryForm.control}
                      render={({ field }) => (
                        <RichTextEditor
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={language === 'de' ? 'Notizen...' : 'Notes...'}
                          maxLength={5000}
                          minHeight={80}
                        />
                      )}
                    />
                  </FormField>
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/20 shrink-0">
              <Button type="button" variant="outline" onClick={() => { setFormOpen(false); setEditEntry(null); }}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={addEntry.isPending || updateEntry.isPending}>
                {(addEntry.isPending || updateEntry.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? t('common.save', 'Save') : t('common.create', 'Create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Send confirmation dialog ───────────────────────── */}
      <Dialog open={confirmSendOpen} onOpenChange={(v) => { if (!v) { setConfirmSendOpen(false); setConfirmSendEntry(null); setShortNotice(null); } else setConfirmSendOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4.5 w-4.5 text-primary" />
              {t('pm.sendConfirmation', 'Send Confirmation')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={sendForm.handleSubmit((data) => onSendConfirmationSubmit(data, false))} className="flex flex-1 flex-col overflow-hidden">
            <FormBody>
              {confirmSendEntry && (
                <div className="rounded-xl bg-muted/50 border border-border/50 p-3.5 text-sm">
                  <p className="font-medium">{confirmSendEntry.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {confirmSendEntry.entryType === 'PHASE'
                      ? `${formatDate(confirmSendEntry.startDate)} – ${formatDate(confirmSendEntry.endDate)}`
                      : formatDate(confirmSendEntry.milestoneDate)}
                  </p>
                </div>
              )}

              <FormField label={language === 'de' ? 'Partner E-Mail' : 'Partner Email'} required error={sendForm.formState.errors.partnerContactEmail?.message}>
                <Input type="email" {...sendForm.register('partnerContactEmail')} />
              </FormField>

              <FormField label={t('pm.partnerName', 'Partner Name')}>
                <Input {...sendForm.register('partnerName')} />
              </FormField>

              <Controller
                name="partnerCompanyId"
                control={sendForm.control}
                render={({ field }) => (
                  <FormField label={language === 'de' ? 'Partnerfirma' : 'Partner Company'} required error={sendForm.formState.errors.partnerCompanyId?.message}>
                    <PartnerCompanyPicker value={field.value || null} onChange={(v) => field.onChange(v || '')} language={language} />
                  </FormField>
                )}
              />

              <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span>
                  {language === 'de'
                    ? 'Eine PDF-Terminbestätigung wird automatisch erstellt und der E-Mail angehängt.'
                    : 'A PDF appointment confirmation is generated automatically and attached to the email.'}
                </span>
              </div>

              {shortNotice && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <p className="text-amber-800 dark:text-amber-300">
                        {language === 'de'
                          ? `Nur ${shortNotice.businessDays} Arbeitstage bis zum Termin (empfohlen: mind. ${shortNotice.leadDays}). Trotzdem senden?`
                          : `Only ${shortNotice.businessDays} business days until the scheduled date (recommended minimum ${shortNotice.leadDays}). Send anyway?`}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
                        disabled={sendConfirmation.isPending}
                        onClick={() => onSendConfirmationSubmit(sendForm.getValues(), true)}
                      >
                        {sendConfirmation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        {language === 'de' ? 'Trotzdem senden' : 'Send anyway'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </FormBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setConfirmSendOpen(false); setConfirmSendEntry(null); setShortNotice(null); }}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={sendConfirmation.isPending}>
                {sendConfirmation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4 mr-1.5" />
                {t('pm.send', 'Send')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Update confirmation response dialog ────────────── */}
      <Dialog open={confirmResponseOpen} onOpenChange={(v) => { if (!v) { setConfirmResponseOpen(false); setConfirmResponseEntry(null); setConfirmResponseConf(null); } else setConfirmResponseOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4.5 w-4.5 text-primary" />
              {t('pm.recordResponse', 'Record Response')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={responseForm.handleSubmit(onResponseSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <FormBody>
              {confirmResponseConf && (
                <div className="rounded-xl bg-muted/50 border border-border/50 p-3.5 text-sm">
                  <p className="text-xs text-muted-foreground">{confirmResponseConf.partnerContactEmail}</p>
                </div>
              )}

              <FormField label={t('pm.status', 'Status')}>
                <Select value={responseStatus} onValueChange={(v) => responseForm.setValue('confirmationStatus', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONFIRMED">{language === 'de' ? 'Bestätigt' : 'Confirmed'}</SelectItem>
                    <SelectItem value="DECLINED">{language === 'de' ? 'Abgelehnt' : 'Declined'}</SelectItem>
                    <SelectItem value="ALTERNATIVE_PROPOSED">{language === 'de' ? 'Alternative vorgeschlagen' : 'Alternative Proposed'}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label={t('pm.notes', 'Notes')}>
                <Textarea {...responseForm.register('responseNotes')} rows={3} />
              </FormField>
            </FormBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setConfirmResponseOpen(false); setConfirmResponseEntry(null); setConfirmResponseConf(null); }}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={updateConfirmation.isPending}>
                {updateConfirmation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.save', 'Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Bulk confirmation dialog ───────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={(v) => { if (!v) { setBulkOpen(false); setBulkResults(null); } else setBulkOpen(v); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4.5 w-4.5 text-primary" />
              {language === 'de' ? 'Bestätigungen senden' : 'Send confirmations'}
            </DialogTitle>
            <DialogDescription>
              {language === 'de'
                ? `${selectedEntries.length} Partner-Termin(e). E-Mail je Termin angeben.`
                : `${selectedEntries.length} partner appointment(s). Provide an email per appointment.`}
            </DialogDescription>
          </DialogHeader>

          <FormBody>
            {!bulkResults && (
              <div className="space-y-2.5">
                {selectedEntries.map((e) => (
                    <div key={e._id} className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{e.name}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {e.entryType === 'PHASE' ? formatDate(e.startDate) : formatDate(e.milestoneDate)}
                        </span>
                      </div>
                      <Input
                        type="email"
                        value={bulkEmails[e._id] || ''}
                        onChange={(ev) => setBulkEmails((p) => ({ ...p, [e._id]: ev.target.value }))}
                        placeholder={language === 'de' ? 'Partner E-Mail' : 'Partner email'}
                        className="h-8 text-sm"
                      />
                    </div>
                ))}
              </div>
            )}

            {/* Per-item result summary */}
            {bulkResults && (
              <div className="space-y-2">
                {bulkResults.map((r) => {
                  const entry = entries.find((e) => e._id === r.entryId);
                  const statusMeta = {
                    sent: { color: 'text-emerald-600', label: language === 'de' ? 'Gesendet' : 'Sent', Icon: Check },
                    short_notice: { color: 'text-amber-600', label: language === 'de' ? 'Kurzfristig' : 'Short notice', Icon: AlertTriangle },
                    error: { color: 'text-destructive', label: language === 'de' ? 'Fehler' : 'Error', Icon: X },
                  }[r.status] || { color: 'text-muted-foreground', label: r.status, Icon: AlertTriangle };
                  const SIcon = statusMeta.Icon;
                  return (
                    <div key={r.entryId} className="flex items-start justify-between gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
                      <span className="truncate">{entry?.name || r.entryId}</span>
                      <span className={cn('inline-flex items-center gap-1 text-xs shrink-0', statusMeta.color)}>
                        <SIcon className="h-3.5 w-3.5" />
                        {statusMeta.label}
                        {r.status === 'short_notice' && r.businessDays != null && (
                          <span className="text-muted-foreground">
                            ({r.businessDays}/{r.leadDays} {language === 'de' ? 'Tage' : 'days'})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}

                {shortNoticeResults.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm space-y-2">
                    <p className="text-amber-800 dark:text-amber-300 text-xs">
                      {language === 'de'
                        ? `${shortNoticeResults.length} Termin(e) unter der Vorlaufzeit. Trotzdem senden?`
                        : `${shortNoticeResults.length} appointment(s) under the lead time. Send anyway?`}
                    </p>
                    <Button
                      type="button" size="sm" variant="outline"
                      className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
                      disabled={sendBulkConfirmations.isPending}
                      onClick={() => {
                        // Re-submit only the short-notice items with acknowledgement.
                        const shortIds = new Set(shortNoticeResults.map((r) => r.entryId));
                        const items = selectedEntries
                          .filter((e) => shortIds.has(e._id))
                          .map((e) => ({
                            entryId: e._id,
                            partnerCompanyId: e.partnerCompanyId,
                            partnerContactEmail: (bulkEmails[e._id] || '').trim().toLowerCase(),
                            partnerName: e.partnerName || '',
                            acknowledgeShortNotice: true,
                          }));
                        sendBulkConfirmations.mutate(items);
                      }}
                    >
                      {sendBulkConfirmations.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      {language === 'de' ? 'Kurzfristige trotzdem senden' : 'Send short-notice anyway'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </FormBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setBulkOpen(false); setBulkResults(null); }}>
              {bulkResults ? t('common.close', 'Close') : t('common.cancel', 'Cancel')}
            </Button>
            {!bulkResults && (
              <Button type="button" disabled={!allBulkEmailsValid || sendBulkConfirmations.isPending} onClick={() => submitBulk(false)}>
                {sendBulkConfirmations.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4 mr-1.5" />
                {language === 'de' ? `Senden (${selectedEntries.length})` : `Send (${selectedEntries.length})`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={t('pm.deleteEntry', 'Delete Entry')}
        description={language === 'de' ? `"${deleteTarget?.name}" wirklich löschen?` : `Delete "${deleteTarget?.name}"?`}
        onConfirm={() => deleteEntry.mutate(deleteTarget._id)}
        isLoading={deleteEntry.isPending}
        variant="destructive"
      />
    </div>
  );
}
