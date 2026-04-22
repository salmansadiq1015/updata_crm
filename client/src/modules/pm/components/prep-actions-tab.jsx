'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { queryKeys } from '@/lib/query/keys';
import { prepActionService } from '@/modules/pm/services/prep-action-service';
import { usePrepActionMutations } from '@/modules/pm/hooks/use-prep-action-mutations';
import { createPrepActionSchema, updatePrepActionSchema } from '@/modules/pm/validations/prep-action';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters';
import {
  Plus, Pencil, Trash2, Loader2, AlertTriangle, CheckCircle2,
  ListChecks, Clock,
} from 'lucide-react';

function ActionCard({ action, language, onEdit, onDelete, canWrite }) {
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
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(action)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => onDelete(action)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PrepActionsTab({ projectId }) {
  const { t, language } = useLanguage();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('projects:write');

  const [formOpen, setFormOpen] = useState(false);
  const [editAction, setEditAction] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  const { register, handleSubmit, watch, setValue, reset, control, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { actionType: 'OTHER', title: '', isMandatory: false },
  });

  const watchType = watch('actionType');

  const openCreate = () => {
    setEditAction(null);
    reset({ actionType: 'OTHER', title: '', description: '', isMandatory: false, dueDate: '' });
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
      fundingDetails: action.fundingDetails || undefined,
      materialOrderDetails: action.materialOrderDetails || undefined,
    });
    setFormOpen(true);
  };

  const onFormSubmit = (data) => {
    const cleaned = { ...data };
    if (!cleaned.description) delete cleaned.description;
    if (!cleaned.dueDate) delete cleaned.dueDate;
    if (isEdit) {
      update.mutate({ actionId: editAction._id, data: cleaned });
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
              <Textarea {...register('description')} rows={2} />
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
                <MaterialItemsList control={control} register={register} language={language} />
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
