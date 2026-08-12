'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, FolderKanban, ListChecks, Loader2, Plus, User } from 'lucide-react';
import { taskService } from '@/modules/tasks/services/task-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PermissionGate } from '@/shared/components/permission-gate';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showError, showSuccess } from '@/lib/toast';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, taskPriorityBorderClass } from '@/modules/tasks/ui/task-ui-constants';

const NO_DEPARTMENT = 'none';

const STATUS_STYLE = {
  OPEN: 'bg-muted text-muted-foreground',
  IN_PROGRESS: 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
  ON_HOLD: 'bg-amber-500/10 text-amber-600',
};

/**
 * Every open task concerning the object, grouped by department (Abteilung).
 * Covers tasks hung directly off the object and those reaching it through one
 * of its projects — the server resolves both.
 */
export function SiteTasksTab({ siteId }) {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'site-overview', siteId],
    queryFn: () => taskService.siteOverview(siteId),
    enabled: !!siteId,
  });

  const tasks = data?.tasks || [];
  const byDepartment = data?.byDepartment || [];

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t('crm.sites.openTasksTitle', 'Offene Aufgaben')}</h3>
          <span className="text-xs text-muted-foreground">({tasks.length})</span>
        </div>
        <PermissionGate permission="tasks:write">
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> {t('crm.sites.newTask', 'Neue Aufgabe')}
          </Button>
        </PermissionGate>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={t('crm.sites.tasksEmpty', 'Keine offenen Aufgaben')}
          description={t('crm.sites.tasksEmptyDesc', 'Aufgaben zu diesem Objekt erscheinen hier, nach Abteilungen gruppiert.')}
        />
      ) : (
        <div className="space-y-4">
          {byDepartment.map((dep) => {
            const depTasks = tasks.filter((task) => (
              dep.departmentId
                ? String(task.departmentId?._id || task.departmentId) === dep.departmentId
                : !task.departmentId
            ));
            return (
              <div key={dep.departmentId || NO_DEPARTMENT} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: dep.color || 'var(--muted-foreground)' }}
                    aria-hidden
                  />
                  <h4 className="text-sm font-semibold text-foreground">
                    {dep.name || t('crm.sites.tasksNoDepartment', 'Ohne Abteilung')}
                  </h4>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {dep.count}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {depTasks.map((task) => (
                    <li key={task._id}>
                      <Link
                        href={`/tasks/${task.listId}/${task._id}`}
                        className={cn(
                          'flex items-center gap-3 border-l-2 px-4 py-2.5 transition-colors hover:bg-muted/40',
                          taskPriorityBorderClass[task.priority] || taskPriorityBorderClass.NONE,
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{task.title}</span>
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_STYLE[task.status] || STATUS_STYLE.OPEN)}>
                          {t(`tasks.status.${task.status}`, task.status)}
                        </span>
                        {task.projectId && (
                          <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                            <FolderKanban className="h-3 w-3" /> {task.projectId.name}
                          </span>
                        )}
                        {task.assigneeId && (
                          <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                            <User className="h-3 w-3" /> {[task.assigneeId.firstName, task.assigneeId.lastName].filter(Boolean).join(' ')}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                            <CalendarDays className="h-3 w-3" /> {formatDate(task.dueDate)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {hasPermission('tasks:write') && (
        <SiteTaskCreateDialog siteId={siteId} open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </div>
  );
}

function SiteTaskCreateDialog({ siteId, open, onOpenChange }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState(NO_DEPARTMENT);
  const [priority, setPriority] = useState('NONE');
  const [dueDate, setDueDate] = useState('');

  const { data: departments = [] } = useQuery({
    queryKey: ['tasks', 'departments'],
    queryFn: () => taskService.listDepartments(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const reset = () => { setTitle(''); setDepartmentId(NO_DEPARTMENT); setPriority('NONE'); setDueDate(''); };

  const create = useMutation({
    mutationFn: () => taskService.create({
      title: title.trim(),
      siteId,
      departmentId: departmentId === NO_DEPARTMENT ? null : departmentId,
      priority,
      dueDate: dueDate || null,
      // Herkunft so the task board shows where it came from.
      source: { type: 'SITE', refId: siteId },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', 'site-overview', siteId] });
      showSuccess(t('crm.sites.taskCreated', 'Aufgabe erstellt'));
      reset();
      onOpenChange(false);
    },
    onError: (err) => showError(err),
  });

  const handleOpenChange = (next) => {
    if (!next && !create.isPending) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('crm.sites.newTask', 'Neue Aufgabe')}</DialogTitle>
          <DialogDescription>
            {t('crm.sites.newTaskDesc', 'Die Aufgabe wird diesem Objekt zugeordnet und erscheint in der Übersicht.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate(); }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="site-task-title">{t('crm.sites.taskTitle', 'Titel')}*</Label>
            <Input id="site-task-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus disabled={create.isPending} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('crm.sites.taskDepartment', 'Abteilung')}</Label>
            <Select value={departmentId} onValueChange={setDepartmentId} disabled={create.isPending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DEPARTMENT}>{t('crm.sites.tasksNoDepartment', 'Ohne Abteilung')}</SelectItem>
                {departments.map((dep) => (
                  <SelectItem key={dep._id} value={dep._id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dep.color || 'var(--muted-foreground)' }} aria-hidden />
                      {dep.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('crm.sites.taskPriority', 'Priorität')}</Label>
              <Select value={priority} onValueChange={setPriority} disabled={create.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{t(`tasks.priority.${p}`, TASK_PRIORITY_LABEL[p])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-task-due">{t('crm.sites.taskDueDate', 'Fällig am')}</Label>
              <Input id="site-task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={create.isPending} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={create.isPending}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" className="gap-2" disabled={!title.trim() || create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('crm.sites.createTask', 'Aufgabe erstellen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
