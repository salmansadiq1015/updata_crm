'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { queryKeys } from '@/lib/query/keys';
import { prepActionService } from '@/modules/pm/services/prep-action-service';
import { usePrepActionMutations } from '@/modules/pm/hooks/use-prep-action-mutations';
import { createPrepActionSchema, updatePrepActionSchema } from '@/modules/pm/validations/prep-action';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { ENDPOINTS } from '@/lib/api/endpoints';
import apiClient from '@/lib/api/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  PREP_ACTION_TYPE_CONFIG, PREP_ACTION_STATUS_CONFIG,
  FUNDING_STATUS_CONFIG, DELIVERY_STATUS_CONFIG,
} from '@/modules/pm/constants/pm-constants';
import { MaterialItemsList } from './material-items-list';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/lib/formatters';
import { showError, showSuccess } from '@/lib/toast';
import {
  Plus, Pencil, Trash2, Loader2, AlertTriangle, CheckCircle2,
  ListChecks, Clock, User, Check, Hash, Paperclip, Download, Upload,
  History, FileText,
} from 'lucide-react';

/** Minimal user picker backed by the users list endpoint — mirrors project-filter-bar.jsx */
function UserPickerField({ value, onChange }) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.list({ status: 'active', limit: 100, q: debouncedSearch }),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.USERS.LIST, {
        params: { status: 'active', limit: 100, ...(debouncedSearch ? { search: debouncedSearch } : {}) },
      });
      return res.data;
    },
  });
  const users = Array.isArray(usersData) ? usersData : [];
  const selected = users.find((u) => u._id === value) || null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 h-10 w-full rounded-md border bg-background px-3 text-sm transition-colors hover:bg-accent/40',
            value && 'border-primary/40',
          )}
        >
          {selected ? (
            <>
              <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[9px] font-semibold flex items-center justify-center shrink-0">
                {selected.firstName?.[0]}{selected.lastName?.[0]}
              </span>
              <span className="truncate">{selected.firstName} {selected.lastName}</span>
            </>
          ) : (
            <>
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{language === 'de' ? 'Niemand zugewiesen' : 'Unassigned'}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0 shadow-lg" align="start">
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
            <span className="text-muted-foreground">{language === 'de' ? 'Niemand' : 'Unassigned'}</span>
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
          {users.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              {language === 'de' ? 'Keine Nutzer gefunden' : 'No users found'}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ActionCard({ action, language, onEdit, onDelete, onManage, canWrite }) {
  const typeCfg = PREP_ACTION_TYPE_CONFIG[action.actionType];
  const statusCfg = PREP_ACTION_STATUS_CONFIG[action.status];
  const TypeIcon = typeCfg?.icon || ListChecks;
  const isOverdue = action.dueDate && new Date(action.dueDate) < new Date() && !['COMPLETED', 'CANCELLED'].includes(action.status);

  return (
    <div className={cn(
      'rounded-lg border bg-card p-4 shadow-theme-sm transition-all hover:shadow-theme-md',
      isOverdue && 'border-red-300 dark:border-red-800',
      action.isMandatory && 'ring-1 ring-amber-200 dark:ring-amber-800',
    )}>
      <div className="flex items-start gap-3">
        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', statusCfg?.bgColor || 'bg-muted')}>
          <TypeIcon className={cn('h-4 w-4', statusCfg?.textColor || 'text-muted-foreground')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{action.title}</span>
            {action.isMandatory && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-500/10 px-1.5 py-0.5 rounded">
                {language === 'de' ? 'Pflicht' : 'Required'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className={cn('inline-flex items-center gap-1', statusCfg?.textColor)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', statusCfg?.dotColor)} />
              {language === 'de' ? statusCfg?.label : statusCfg?.labelEn}
            </span>
            {action.dueDate && (
              <span className={cn('flex items-center gap-1', isOverdue && 'text-red-600 dark:text-red-400')}>
                <Clock className="h-3 w-3" />
                {formatDate(action.dueDate)}
                {isOverdue && <AlertTriangle className="h-3 w-3" />}
              </span>
            )}
            <span className="text-muted-foreground/60">
              {language === 'de' ? typeCfg?.label : typeCfg?.labelEn}
            </span>
            {action.externalReference && (
              <span className="flex items-center gap-1 text-muted-foreground/80">
                <Hash className="h-3 w-3" />
                {action.externalReference}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onManage(action)}
            title={language === 'de' ? 'Anhänge & Verlauf' : 'Attachments & history'}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {action.attachments?.length > 0 && (
              <span className="ml-0.5 text-[10px] tabular-nums">{action.attachments.length}</span>
            )}
          </Button>
          {canWrite && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(action)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => onDelete(action)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Map prep-action audit eventTypes to readable labels.
const HISTORY_EVENT_LABELS = {
  'prep_action.created': { en: 'Created', de: 'Erstellt' },
  'prep_action.updated': { en: 'Updated', de: 'Aktualisiert' },
  'prep_action.deleted': { en: 'Deleted', de: 'Gelöscht' },
  'prep_action.attachment_added': { en: 'Attachment added', de: 'Anhang hinzugefügt' },
};

function ManageActionDialog({ open, onClose, projectId, action, language, t, canWrite }) {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const actionId = action?._id;

  const { data: attachments = [], isLoading: loadingAttachments } = useQuery({
    queryKey: queryKeys.pm.prepActions.attachments(projectId, actionId),
    queryFn: () => prepActionService.getAttachments(projectId, actionId),
    enabled: open && !!actionId,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: queryKeys.pm.prepActions.history(projectId, actionId),
    queryFn: () => prepActionService.getHistory(projectId, actionId),
    enabled: open && !!actionId,
  });

  const upload = useMutation({
    mutationFn: (file) => prepActionService.uploadAttachment(projectId, actionId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pm.prepActions.attachments(projectId, actionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pm.prepActions.history(projectId, actionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pm.prepActions.byProject(projectId) });
      showSuccess(language === 'de' ? 'Anhang hochgeladen' : 'Attachment uploaded');
    },
    onError: (err) => showError(err.message),
  });

  const handleDownload = async (att) => {
    try {
      const result = await prepActionService.getAttachmentDownloadUrl(projectId, actionId, att.fileId);
      const url = result?.url || result;
      if (url) window.open(url, '_blank');
    } catch (err) {
      showError(err.message);
    }
  };

  const attachList = Array.isArray(attachments) ? attachments : [];
  const historyList = Array.isArray(history) ? history : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">{action?.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Attachments */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" />
                {language === 'de' ? 'Anhänge' : 'Attachments'}
              </h4>
              {canWrite && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={upload.isPending}
                    onClick={() => fileRef.current?.click()}
                  >
                    {upload.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                    {language === 'de' ? 'Hochladen' : 'Upload'}
                  </Button>
                </>
              )}
            </div>

            {loadingAttachments ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-md" />)}
              </div>
            ) : attachList.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-1">
                {language === 'de' ? 'Keine Anhänge.' : 'No attachments.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {attachList.map((att) => (
                  <li
                    key={att._id || att.fileId}
                    className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-xs"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{att.fileName}</span>
                    {att.uploadedAt && (
                      <span className="text-muted-foreground/70 shrink-0">{formatDate(att.uploadedAt)}</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleDownload(att)}
                      title={language === 'de' ? 'Herunterladen' : 'Download'}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          {/* Change history */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              {language === 'de' ? 'Änderungsverlauf' : 'Change History'}
            </h4>

            {loadingHistory ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
              </div>
            ) : historyList.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-1">
                {language === 'de' ? 'Noch kein Verlauf.' : 'No history yet.'}
              </p>
            ) : (
              <div className="relative space-y-0">
                <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
                {historyList.map((entry, idx) => {
                  const label = HISTORY_EVENT_LABELS[entry.eventType];
                  const changedFields = entry.details?.changedFields;
                  return (
                    <div key={entry._id || idx} className="relative flex gap-3 pb-4 last:pb-0">
                      <div className="relative z-10 mt-1 h-[11px] w-[11px] rounded-full ring-4 ring-background shrink-0 bg-primary/60" />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-xs font-medium">
                          {label ? (language === 'de' ? label.de : label.en) : entry.eventType}
                        </p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(entry.timestamp)}
                        </p>
                        {Array.isArray(changedFields) && changedFields.length > 0 && (
                          <p className="text-[11px] text-muted-foreground/80">
                            {(language === 'de' ? 'Felder: ' : 'Fields: ') + changedFields.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PrepActionsTab({ projectId }) {
  const { t, language } = useLanguage();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('projects:write');

  const [formOpen, setFormOpen] = useState(false);
  const [editAction, setEditAction] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [manageAction, setManageAction] = useState(null);

  const { data: actions = [], isLoading } = useQuery({
    queryKey: queryKeys.pm.prepActions.byProject(projectId),
    queryFn: () => prepActionService.getPrepActions(projectId),
    enabled: !!projectId,
  });

  const { create, update, remove } = usePrepActionMutations(projectId, {
    onCreate: () => setFormOpen(false),
    onUpdate: () => { setFormOpen(false); setEditAction(null); },
    onDelete: () => setDeleteTarget(null),
  });

  const isEdit = !!editAction;
  const schema = isEdit ? updatePrepActionSchema : createPrepActionSchema;

  const { register, handleSubmit, watch, setValue, getValues, reset, control, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { actionType: 'OTHER', title: '', isMandatory: false, assignedToId: null, externalReference: '' },
  });

  const watchType = watch('actionType');

  const openCreate = () => {
    setEditAction(null);
    reset({ actionType: 'OTHER', title: '', description: '', isMandatory: false, dueDate: '', assignedToId: null, externalReference: '' });
    setFormOpen(true);
  };

  const openEdit = (action) => {
    setEditAction(action);
    reset({
      title: action.title || '',
      description: action.description || '',
      isMandatory: action.isMandatory || false,
      status: action.status,
      dueDate: action.dueDate ? new Date(action.dueDate).toISOString().split('T')[0] : '',
      actionType: action.actionType,
      assignedToId: action.assignedToId || null,
      externalReference: action.externalReference || '',
      fundingDetails: action.fundingDetails || undefined,
      materialOrderDetails: action.materialOrderDetails || undefined,
    });
    setFormOpen(true);
  };

  const onFormSubmit = (data) => {
    const cleaned = { ...data };
    if (!cleaned.description) delete cleaned.description;
    if (!cleaned.dueDate) delete cleaned.dueDate;
    if (!cleaned.externalReference) cleaned.externalReference = null;
    if (!cleaned.assignedToId) cleaned.assignedToId = null;
    if (isEdit) {
      // AF-2: detect when this completion clears the last outstanding mandatory
      // action so we can tell the user the project may now proceed.
      const isThisMandatory = cleaned.isMandatory ?? editAction.isMandatory;
      const otherMandatory = mandatory.filter((a) => a._id !== editAction._id);
      const willProceed = isThisMandatory
        && cleaned.status === 'COMPLETED'
        && editAction.status !== 'COMPLETED'
        && otherMandatory.every((a) => a.status === 'COMPLETED');

      update.mutate({ actionId: editAction._id, data: cleaned }, {
        onSuccess: () => {
          if (willProceed) {
            showSuccess(language === 'de'
              ? 'Alle Pflichtaktionen abgeschlossen — das Projekt kann nun zu „In Arbeit" wechseln.'
              : 'All mandatory actions complete — the project can now proceed to "In Progress".');
          }
        },
      });
    } else {
      create.mutate(cleaned);
    }
  };

  // Progress
  const completed = actions.filter((a) => a.status === 'COMPLETED').length;
  const mandatory = actions.filter((a) => a.isMandatory);
  const mandatoryCompleted = mandatory.filter((a) => a.status === 'COMPLETED').length;
  const progressPct = actions.length > 0 ? Math.round((completed / actions.length) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with progress */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="font-medium">{completed}/{actions.length}</span>
            <span className="text-muted-foreground">{language === 'de' ? 'abgeschlossen' : 'completed'}</span>
          </div>
          {mandatory.length > 0 && (
            <span className="text-xs text-amber-600">
              ({mandatoryCompleted}/{mandatory.length} {language === 'de' ? 'Pflicht' : 'mandatory'})
            </span>
          )}
        </div>
        {canWrite && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            {t('pm.newAction', 'New Action')}
          </Button>
        )}
      </div>

      {actions.length > 0 && (
        <Progress value={progressPct} className="h-1.5" />
      )}

      {/* Actions list */}
      {actions.length === 0 ? (
        <EmptyState
          title={t('pm.prepActions', 'Preparatory Actions')}
          description={language === 'de' ? 'Noch keine Vorbereitungen erstellt.' : 'No preparatory actions created yet.'}
        />
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <ActionCard
              key={action._id}
              action={action}
              language={language}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              onManage={setManageAction}
              canWrite={canWrite}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) { setFormOpen(false); setEditAction(null); } else setFormOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? t('pm.editAction', 'Edit Action') : t('pm.newAction', 'New Action')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('pm.actionType', 'Type')}</Label>
                <Select value={watchType} onValueChange={(v) => setValue('actionType', v)} disabled={isEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PREP_ACTION_TYPE_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('pm.dueDate', 'Due Date')}</Label>
                <Input type="date" {...register('dueDate')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {language === 'de' ? 'Titel' : 'Title'}<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('pm.description', 'Description')}</Label>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={language === 'de' ? 'Beschreibung...' : 'Description...'}
                    maxLength={5000}
                    minHeight={80}
                  />
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {t('pm.assignedTo', 'Assigned To')}
                </Label>
                <UserPickerField
                  value={watch('assignedToId') || null}
                  onChange={(v) => setValue('assignedToId', v, { shouldDirty: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {t('pm.reference', 'Reference')}
                </Label>
                <Input
                  {...register('externalReference')}
                  placeholder={language === 'de' ? 'Externe Referenz' : 'External reference'}
                />
                {errors.externalReference && <p className="text-xs text-destructive">{errors.externalReference.message}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={watch('isMandatory')} onCheckedChange={(v) => setValue('isMandatory', v)} />
              <Label className="text-xs">{t('pm.mandatory', 'Mandatory')}</Label>
            </div>

            {isEdit && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('pm.status', 'Status')}</Label>
                <Select value={watch('status')} onValueChange={(v) => setValue('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PREP_ACTION_STATUS_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* AF-3: warn that rejecting/cancelling a mandatory action blocks progression */}
                {watch('isMandatory') && ['REJECTED', 'CANCELLED'].includes(watch('status')) && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2.5 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                    <span className="text-amber-800 dark:text-amber-300">
                      {language === 'de'
                        ? 'Diese Pflichtaktion blockiert den Projektfortschritt nach „In Arbeit", solange sie nicht ersetzt oder als optional markiert wird.'
                        : 'This mandatory action will block the project from moving to "In Progress" unless it is replaced or marked optional.'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Funding sub-form */}
            {watchType === 'FUNDING_APPLICATION' && (
              <>
                <Separator />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('pm.fundingBody', 'Funding Details')}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">{t('pm.fundingBody', 'Funding Body')}</Label><Input {...register('fundingDetails.fundingBody')} /></div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('pm.fundingStatus', 'Funding Status')}</Label>
                    <Select value={watch('fundingDetails.fundingStatus') || 'DRAFT'} onValueChange={(v) => setValue('fundingDetails.fundingStatus', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(FUNDING_STATUS_CONFIG).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">{t('pm.applicationAmount', 'Application Amount')}</Label><Input type="number" step="0.01" {...register('fundingDetails.applicationAmount')} /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('pm.approvedAmount', 'Approved Amount')}</Label><Input type="number" step="0.01" {...register('fundingDetails.approvedAmount')} /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('pm.submissionDate', 'Submission Date')}</Label><Input type="date" {...register('fundingDetails.submissionDate')} /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('pm.expectedDecision', 'Expected Decision')}</Label><Input type="date" {...register('fundingDetails.expectedDecisionDate')} /></div>
                </div>
              </>
            )}

            {/* Material Order sub-form */}
            {watchType === 'MATERIAL_ORDER' && (
              <>
                <Separator />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('pm.materials', 'Material Order')}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">{t('pm.supplier', 'Supplier')}</Label><Input {...register('materialOrderDetails.supplier')} /></div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('pm.deliveryStatus', 'Delivery Status')}</Label>
                    <Select value={watch('materialOrderDetails.deliveryStatus') || 'PENDING'} onValueChange={(v) => setValue('materialOrderDetails.deliveryStatus', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(DELIVERY_STATUS_CONFIG).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">{t('pm.orderRef', 'Order Reference')}</Label><Input {...register('materialOrderDetails.orderReference')} /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('pm.orderDate', 'Order Date')}</Label><Input type="date" {...register('materialOrderDetails.orderDate')} /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('pm.expectedDelivery', 'Expected Delivery')}</Label><Input type="date" {...register('materialOrderDetails.expectedDeliveryDate')} /></div>
                </div>
                <MaterialItemsList control={control} register={register} setValue={setValue} getValues={getValues} language={language} />
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setFormOpen(false); setEditAction(null); }}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? t('common.save', 'Save') : t('common.create', 'Create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ManageActionDialog
        open={!!manageAction}
        onClose={() => setManageAction(null)}
        projectId={projectId}
        action={manageAction}
        language={language}
        t={t}
        canWrite={canWrite}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={t('pm.actionDeleted', 'Delete Action')}
        description={language === 'de' ? `"${deleteTarget?.title}" wirklich loeschen?` : `Delete "${deleteTarget?.title}"?`}
        onConfirm={() => remove.mutate(deleteTarget._id)}
        isLoading={remove.isPending}
        variant="destructive"
      />
    </div>
  );
}
