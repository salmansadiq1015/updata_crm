'use client';

import { useState } from 'react';
import {
  CalendarDays,
  Loader2,
  NotebookPen,
  Percent,
  Trash2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { useLanguage } from '@/lib/i18n/language-context';
import { useCoarseMutations } from '../../hooks/use-coarse-mutations';

const PERCENT_OPTIONS = [25, 50, 75, 100];

function CoarseEditForm({ allocation, onOpenChange }) {
  const { t } = useLanguage();
  const [allocationPercent, setAllocationPercent] = useState(allocation.allocationPercent);
  const [notes, setNotes] = useState(allocation.notes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { update, remove } = useCoarseMutations({
    onUpdate: () => onOpenChange(false),
    onDelete: () => onOpenChange(false),
  });

  const employeeName = allocation.employeeId?.firstName
    ? `${allocation.employeeId.firstName} ${allocation.employeeId.lastName}`
    : String(allocation.employeeId);
  const projectName = allocation.projectId?.name || String(allocation.projectId);

  const hasChanges =
    allocationPercent !== allocation.allocationPercent ||
    (notes || '') !== (allocation.notes || '');

  const submit = () => {
    const data = {};
    if (allocationPercent !== allocation.allocationPercent) data.allocationPercent = allocationPercent;
    if ((notes || '') !== (allocation.notes || '')) data.notes = notes || null;
    update.mutate({ id: allocation._id, data });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    remove.mutate(allocation._id);
  };

  const isPending = update.isPending || remove.isPending;

  return (
    <>
      <DialogHeader className="border-b border-border/70 bg-muted/20 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-xl font-semibold tracking-normal">
              {t('deploy.coarse.editAllocation', 'Zuteilung bearbeiten')}
            </DialogTitle>
            <DialogDescription className="text-sm leading-5">
              {t('deploy.coarse.editAllocationDesc', 'Prozentzuteilung und Notizen ändern.')}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-5 px-6 py-5">
        <FormField label={t('deploy.coarse.employee', 'Mitarbeiter')}>
          <div className="flex h-11 items-center rounded-xl border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground">
            {employeeName}
          </div>
        </FormField>

        <FormField label={t('deploy.coarse.project', 'Projekt')}>
          <div className="flex h-11 items-center rounded-xl border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground">
            {projectName}
          </div>
        </FormField>

        <FormField label={t('deploy.coarse.week', 'Woche')}>
          <div className="flex h-11 items-center rounded-xl border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground">
            <CalendarDays className="mr-2 h-4 w-4" />
            KW {allocation.calendarWeek} / {allocation.calendarYear}
          </div>
        </FormField>

        <FormField label={t('deploy.coarse.allocation', 'Zuteilung')} required>
          <Select
            value={String(allocationPercent)}
            onValueChange={(value) => setAllocationPercent(Number(value))}
          >
            <SelectTrigger className="h-11 rounded-xl border-border/70 bg-background/70 text-sm shadow-sm">
              <span className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {PERCENT_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)} className="text-sm">
                  {value}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t('deploy.coarse.notes', 'Notizen')}>
          <div className="relative">
            <NotebookPen className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Textarea
              rows={5}
              className="min-h-[132px] resize-y rounded-xl border-border/70 bg-background/70 pl-9 text-sm shadow-sm"
              placeholder={t('deploy.coarse.notesPlaceholder', 'Notizen zu dieser Zuteilung...')}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </FormField>
      </div>

      <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
        <div className="flex w-full items-center justify-between">
          <Button
            variant="destructive"
            size="sm"
            className="h-10 gap-1.5 rounded-xl px-4"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 className="h-4 w-4" />
            {confirmDelete
              ? t('deploy.coarse.confirmDelete', 'Zuteilung wirklich löschen?')
              : t('deploy.common.delete', 'Löschen')}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-xl px-4"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t('deploy.common.cancel', 'Abbrechen')}
            </Button>
            <Button
              size="sm"
              className="h-10 rounded-xl px-5 shadow-sm"
              onClick={submit}
              disabled={!hasChanges || isPending}
            >
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('deploy.common.save', 'Speichern')}
            </Button>
          </div>
        </div>
      </DialogFooter>
    </>
  );
}

export function CoarseEditDialog({ open, onOpenChange, allocation }) {
  if (!allocation) return null;

  const formKey = `${allocation._id}-${open ? 'open' : 'closed'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
        <CoarseEditForm
          key={formKey}
          allocation={allocation}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
