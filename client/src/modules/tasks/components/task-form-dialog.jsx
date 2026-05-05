'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormSection } from '@/components/ui/form-field';
import { useLanguage } from '@/lib/i18n/language-context';
import { useTaskLists } from '../hooks/use-task-queries';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG } from '../constants/task-constants';

const schema = z.object({
  title: z.string().min(1, 'Required').max(500),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  listId: z.string().optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
});

const BLANK = {
  title: '', description: '', status: 'OPEN',
  priority: 'NONE', listId: '', assigneeId: '', dueDate: '',
};

export function TaskFormDialog({ open, onOpenChange, onSubmit, initial = null, isLoading }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { data: lists = [] } = useTaskLists();

  const form = useForm({ resolver: zodResolver(schema), defaultValues: BLANK });
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = form;

  useEffect(() => {
    if (open) {
      reset(initial
        ? {
            title: initial.title || '',
            description: initial.description || '',
            status: initial.status || 'OPEN',
            priority: initial.priority || 'NONE',
            listId: initial.listId?._id || initial.listId || '',
            assigneeId: initial.assigneeId?._id || initial.assigneeId || '',
            dueDate: initial.dueDate ? new Date(initial.dueDate).toISOString().slice(0, 10) : '',
          }
        : BLANK
      );
    }
  }, [open, initial, reset]);

  const handleSave = handleSubmit((values) => {
    const data = {
      title: values.title,
      ...(values.description && { description: values.description }),
      ...(values.status && { status: values.status }),
      ...(values.priority && { priority: values.priority }),
      ...(values.listId && { listId: values.listId }),
      ...(values.assigneeId && { assigneeId: values.assigneeId }),
      ...(values.dueDate && { dueDate: new Date(values.dueDate).toISOString() }),
    };
    onSubmit(data);
  });

  const priorityVal = watch('priority');
  const statusVal = watch('status');
  const listVal = watch('listId');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? (de ? 'Aufgabe bearbeiten' : 'Edit Task') : (de ? 'Neue Aufgabe' : 'New Task')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 mt-2">
          <FormSection title={de ? 'Details' : 'Details'}>
            <FormField label={de ? 'Titel' : 'Title'} error={errors.title?.message} required>
              <Input {...register('title')} placeholder={de ? 'Aufgabentitel...' : 'Task title...'} autoFocus />
            </FormField>
            <FormField label={de ? 'Beschreibung' : 'Description'}>
              <Textarea {...register('description')} rows={3} placeholder={de ? 'Beschreibung...' : 'Description...'} className="resize-none" />
            </FormField>
          </FormSection>

          <FormSection title={de ? 'Eigenschaften' : 'Properties'}>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={de ? 'Status' : 'Status'}>
                <Select value={statusVal} onValueChange={(v) => setValue('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {de ? TASK_STATUS_CONFIG[s]?.label : TASK_STATUS_CONFIG[s]?.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label={de ? 'Priorität' : 'Priority'}>
                <Select value={priorityVal} onValueChange={(v) => setValue('priority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {de ? TASK_PRIORITY_CONFIG[p]?.label : TASK_PRIORITY_CONFIG[p]?.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label={de ? 'Liste' : 'List'}>
                <Select value={listVal || ''} onValueChange={(v) => setValue('listId', v)}>
                  <SelectTrigger><SelectValue placeholder={de ? 'Standardliste' : 'Default list'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{de ? 'Standardliste' : 'Default list'}</SelectItem>
                    {lists.filter((l) => !l.isArchived).map((l) => (
                      <SelectItem key={l._id} value={l._id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label={de ? 'Fälligkeitsdatum' : 'Due Date'}>
                <Input type="date" {...register('dueDate')} />
              </FormField>
            </div>
          </FormSection>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (de ? 'Speichern...' : 'Saving...') : (de ? 'Speichern' : 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
