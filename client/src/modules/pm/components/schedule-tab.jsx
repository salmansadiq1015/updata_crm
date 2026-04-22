'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters';
import {
  Plus, Pencil, Trash2, Loader2, ArrowRight, Milestone,
  Send, MessageSquare, Calendar, Users, Building2,
  List, BarChart3, ChevronDown, ChevronRight, Clock,
} from 'lucide-react';

// ── Timeline visualization ──────────────────────────────────────

function ScheduleTimeline({ entries, language }) {
  if (entries.length === 0) return null;

  const allDates = entries.flatMap((e) => {
    if (e.entryType === 'PHASE') return [new Date(e.startDate), new Date(e.endDate)];
    return [new Date(e.milestoneDate)];
  }).filter((d) => !isNaN(d));

  if (allDates.length === 0) return null;

  const minTime = Math.min(...allDates.map((d) => d.getTime()));
  const maxTime = Math.max(...allDates.map((d) => d.getTime()));
  const range = maxTime - minTime || 1;

  const todayPos = ((Date.now() - minTime) / range) * 100;

  const toPercent = (dateStr) => {
    const t = new Date(dateStr).getTime();
    return ((t - minTime) / range) * 100;
  };

  return (
    <div className="relative rounded-xl border border-border bg-card p-6 shadow-theme-sm overflow-x-auto">
      <div className="relative min-w-[600px]" style={{ height: entries.length * 48 + 32 }}>
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

          if (entry.entryType === 'PHASE') {
            const left = toPercent(entry.startDate);
            const right = toPercent(entry.endDate);
            const width = Math.max(right - left, 1);

            return (
              <div key={entry._id} className="absolute flex items-center" style={{ top: y, left: `${left}%`, width: `${width}%`, height: 32 }}>
                <div className={cn(
                  'h-7 w-full rounded-md flex items-center px-2 text-xs font-medium truncate border',
                  statusCfg?.bgColor || 'bg-muted', statusCfg?.textColor || 'text-foreground',
                  statusCfg?.borderColor || 'border-border',
                )}>
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
              style={{ top: y, left: `${pos}%`, transform: 'translateX(-50%)' }}
            >
              <div className={cn('h-5 w-5 rotate-45 rounded-sm border', statusCfg?.bgColor, statusCfg?.borderColor || 'border-border')} />
              <span className="text-[11px] font-medium whitespace-nowrap">{entry.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Entry card (list view) ──────────────────────────────────────

function EntryCard({ entry, language, canWrite, onEdit, onDelete, onSendConfirmation, onUpdateConfirmation }) {
  const [expanded, setExpanded] = useState(false);
  const typeCfg = SCHEDULE_ENTRY_TYPE_CONFIG[entry.entryType];
  const statusCfg = SCHEDULE_STATUS_CONFIG[entry.status];
  const responsibleCfg = RESPONSIBLE_TYPE_CONFIG[entry.responsibleType];
  const TypeIcon = typeCfg?.icon || ArrowRight;
  const isPartner = entry.responsibleType === 'PARTNER_COMPANY';

  const dateLabel = entry.entryType === 'PHASE'
    ? `${formatDate(entry.startDate)} – ${formatDate(entry.endDate)}`
    : formatDate(entry.milestoneDate);

  const confirmations = entry.confirmations || [];

  return (
    <div className="rounded-lg border bg-card shadow-theme-sm transition-all hover:shadow-theme-md">
      <div className="flex items-center gap-3 p-4">
        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', statusCfg?.bgColor || 'bg-muted')}>
          <TypeIcon className={cn('h-4 w-4', statusCfg?.textColor || 'text-muted-foreground')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{entry.name}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {language === 'de' ? typeCfg?.label : typeCfg?.labelEn}
            </Badge>
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
                {canWrite && conf.confirmationStatus === 'SENT' && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => onUpdateConfirmation(entry, conf)}>
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {language === 'de' ? 'Antwort' : 'Respond'}
                  </Button>
                )}
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

  // Confirmation dialogs
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmSendEntry, setConfirmSendEntry] = useState(null);
  const [confirmResponseOpen, setConfirmResponseOpen] = useState(false);
  const [confirmResponseEntry, setConfirmResponseEntry] = useState(null);
  const [confirmResponseConf, setConfirmResponseConf] = useState(null);

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: queryKeys.pm.schedule.byProject(projectId),
    queryFn: () => scheduleService.getSchedule(projectId),
    enabled: !!projectId,
  });

  const entries = useMemo(() => {
    const raw = scheduleData?.entries || scheduleData || [];
    return Array.isArray(raw) ? raw : [];
  }, [scheduleData]);

  const { addEntry, updateEntry, deleteEntry, sendConfirmation, updateConfirmation } = useScheduleMutations(projectId, {
    onAddEntry: () => { setFormOpen(false); entryForm.reset(defaultEntryValues); },
    onUpdateEntry: () => { setFormOpen(false); setEditEntry(null); },
    onDeleteEntry: () => setDeleteTarget(null),
    onSendConfirmation: () => { setConfirmSendOpen(false); setConfirmSendEntry(null); },
    onUpdateConfirmation: () => { setConfirmResponseOpen(false); setConfirmResponseEntry(null); setConfirmResponseConf(null); },
  });

  // ── Entry form ──────────────────────────────────────────────

  const isEdit = !!editEntry;
  const defaultEntryValues = { name: '', entryType: 'PHASE', startDate: '', endDate: '', milestoneDate: '', responsibleType: 'INTERNAL_TEAM', notes: '', sortOrder: 0 };

  const entryForm = useForm({
    resolver: zodResolver(isEdit ? updateEntrySchema : createEntrySchema),
    defaultValues: defaultEntryValues,
  });

  const watchEntryType = entryForm.watch('entryType');

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

    if (isEdit) {
      updateEntry.mutate({ entryId: editEntry._id, data: cleaned });
    } else {
      addEntry.mutate(cleaned);
    }
  };

  // ── Send confirmation form ─────────────────────────────────

  const sendForm = useForm({
    resolver: zodResolver(sendConfirmationSchema),
    defaultValues: { partnerContactEmail: '', partnerCompanyId: '', partnerName: '' },
  });

  const openSendConfirmation = (entry) => {
    setConfirmSendEntry(entry);
    sendForm.reset({
      partnerContactEmail: '',
      partnerCompanyId: entry.partnerCompanyId || '',
      partnerName: '',
    });
    setConfirmSendOpen(true);
  };

  const onSendConfirmationSubmit = (data) => {
    sendConfirmation.mutate({ entryId: confirmSendEntry._id, data });
  };

  // ── Update confirmation response ───────────────────────────

  const responseForm = useForm({
    resolver: zodResolver(updateConfirmationSchema),
    defaultValues: { confirmationStatus: 'CONFIRMED', responseNotes: '' },
  });

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

          {canWrite && (
            <Button size="sm" onClick={openCreateEntry}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t('pm.addPhase', 'Add Entry')}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {entries.length === 0 ? (
        <EmptyState
          title={t('pm.schedule', 'Schedule')}
          description={language === 'de' ? 'Noch keine Einträge erstellt.' : 'No schedule entries created yet.'}
        />
      ) : viewMode === 'timeline' ? (
        <ScheduleTimeline entries={entries} language={language} />
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
            />
          ))}
        </div>
      )}

      {/* ── Entry form dialog ──────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) { setFormOpen(false); setEditEntry(null); } else setFormOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t('pm.editEntry', 'Edit Entry') : t('pm.addPhase', 'Add Entry')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={entryForm.handleSubmit(onEntrySubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{language === 'de' ? 'Typ' : 'Type'}</Label>
                <Select value={watchEntryType} onValueChange={(v) => entryForm.setValue('entryType', v)} disabled={isEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCHEDULE_ENTRY_TYPE_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{language === 'de' ? 'Verantwortlich' : 'Responsible'}</Label>
                <Select value={entryForm.watch('responsibleType')} onValueChange={(v) => entryForm.setValue('responsibleType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESPONSIBLE_TYPE_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                {language === 'de' ? 'Name' : 'Name'}<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input {...entryForm.register('name')} />
              {entryForm.formState.errors.name && <p className="text-xs text-destructive">{entryForm.formState.errors.name.message}</p>}
            </div>

            {/* Date fields based on entry type */}
            {watchEntryType === 'PHASE' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('pm.startDate', 'Start Date')}<span className="text-destructive ml-0.5">*</span></Label>
                  <Input type="date" {...entryForm.register('startDate')} />
                  {entryForm.formState.errors.startDate && <p className="text-xs text-destructive">{entryForm.formState.errors.startDate.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('pm.endDate', 'End Date')}<span className="text-destructive ml-0.5">*</span></Label>
                  <Input type="date" {...entryForm.register('endDate')} />
                  {entryForm.formState.errors.endDate && <p className="text-xs text-destructive">{entryForm.formState.errors.endDate.message}</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('pm.milestoneDate', 'Milestone Date')}<span className="text-destructive ml-0.5">*</span></Label>
                <Input type="date" {...entryForm.register('milestoneDate')} />
                {entryForm.formState.errors.milestoneDate && <p className="text-xs text-destructive">{entryForm.formState.errors.milestoneDate.message}</p>}
              </div>
            )}

            {isEdit && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('pm.status', 'Status')}</Label>
                <Select value={entryForm.watch('status')} onValueChange={(v) => entryForm.setValue('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCHEDULE_STATUS_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">{t('pm.notes', 'Notes')}</Label>
              <Textarea {...entryForm.register('notes')} rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{language === 'de' ? 'Sortierung' : 'Sort Order'}</Label>
              <Input type="number" min={0} {...entryForm.register('sortOrder')} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setFormOpen(false); setEditEntry(null); }}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={addEntry.isPending || updateEntry.isPending}>
                {(addEntry.isPending || updateEntry.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? t('common.save', 'Save') : t('common.create', 'Create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Send confirmation dialog ───────────────────────── */}
      <Dialog open={confirmSendOpen} onOpenChange={(v) => { if (!v) { setConfirmSendOpen(false); setConfirmSendEntry(null); } else setConfirmSendOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('pm.sendConfirmation', 'Send Confirmation')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={sendForm.handleSubmit(onSendConfirmationSubmit)} className="space-y-4 pt-2">
            {confirmSendEntry && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">{confirmSendEntry.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {confirmSendEntry.entryType === 'PHASE'
                    ? `${formatDate(confirmSendEntry.startDate)} – ${formatDate(confirmSendEntry.endDate)}`
                    : formatDate(confirmSendEntry.milestoneDate)}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">{language === 'de' ? 'Partner E-Mail' : 'Partner Email'}<span className="text-destructive ml-0.5">*</span></Label>
              <Input type="email" {...sendForm.register('partnerContactEmail')} />
              {sendForm.formState.errors.partnerContactEmail && <p className="text-xs text-destructive">{sendForm.formState.errors.partnerContactEmail.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('pm.partnerName', 'Partner Name')}</Label>
              <Input {...sendForm.register('partnerName')} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{language === 'de' ? 'Partner-ID' : 'Partner Company ID'}<span className="text-destructive ml-0.5">*</span></Label>
              <Input {...sendForm.register('partnerCompanyId')} placeholder="ObjectId" />
              {sendForm.formState.errors.partnerCompanyId && <p className="text-xs text-destructive">{sendForm.formState.errors.partnerCompanyId.message}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setConfirmSendOpen(false); setConfirmSendEntry(null); }}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={sendConfirmation.isPending}>
                {sendConfirmation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4 mr-1.5" />
                {t('pm.send', 'Send')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Update confirmation response dialog ────────────── */}
      <Dialog open={confirmResponseOpen} onOpenChange={(v) => { if (!v) { setConfirmResponseOpen(false); setConfirmResponseEntry(null); setConfirmResponseConf(null); } else setConfirmResponseOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('pm.recordResponse', 'Record Response')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={responseForm.handleSubmit(onResponseSubmit)} className="space-y-4 pt-2">
            {confirmResponseConf && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="text-xs text-muted-foreground">{confirmResponseConf.partnerContactEmail}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">{t('pm.status', 'Status')}</Label>
              <Select value={responseForm.watch('confirmationStatus')} onValueChange={(v) => responseForm.setValue('confirmationStatus', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONFIRMED">{language === 'de' ? 'Bestätigt' : 'Confirmed'}</SelectItem>
                  <SelectItem value="DECLINED">{language === 'de' ? 'Abgelehnt' : 'Declined'}</SelectItem>
                  <SelectItem value="ALTERNATIVE_PROPOSED">{language === 'de' ? 'Alternative vorgeschlagen' : 'Alternative Proposed'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('pm.notes', 'Notes')}</Label>
              <Textarea {...responseForm.register('responseNotes')} rows={3} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setConfirmResponseOpen(false); setConfirmResponseEntry(null); setConfirmResponseConf(null); }}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={updateConfirmation.isPending}>
                {updateConfirmation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.save', 'Save')}
              </Button>
            </div>
          </form>
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
