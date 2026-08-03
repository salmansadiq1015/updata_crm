'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Flag, MessageSquare, Loader2, ListTodo } from 'lucide-react';
import { taskService } from '../services/task-service';
import { useTasks } from '../hooks/use-task-queries';
import { sourceMeta, departmentIcon } from '../constants/task-source-meta';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { showError, showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';

const STATUS_META = {
  OPEN: { de: 'Neu', en: 'New', cls: 'bg-blue-500/10 text-blue-600' },
  IN_PROGRESS: { de: 'In Bearbeitung', en: 'In progress', cls: 'bg-indigo-500/10 text-indigo-600' },
  ON_HOLD: { de: 'Pausiert', en: 'On hold', cls: 'bg-amber-500/10 text-amber-600' },
  COMPLETED: { de: 'Erledigt', en: 'Completed', cls: 'bg-emerald-500/10 text-emerald-600' },
  CANCELLED: { de: 'Storniert', en: 'Cancelled', cls: 'bg-slate-500/10 text-slate-500' },
};
const PRIORITY_META = {
  URGENT: { de: 'Dringend', en: 'Urgent', color: 'text-red-600' },
  HIGH: { de: 'Hoch', en: 'High', color: 'text-red-500' },
  MEDIUM: { de: 'Mittel', en: 'Medium', color: 'text-amber-500' },
  LOW: { de: 'Niedrig', en: 'Low', color: 'text-emerald-500' },
  NONE: { de: '—', en: '—', color: 'text-muted-foreground' },
};
const PRIORITY_OPTS = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : null);
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const idOf = (v) => (v && typeof v === 'object' ? (v._id || v.id) : v);

/** Aufgaben – nach Abteilungen: department chips + task table (Herkunft, Abteilung, Chat). */
export function TaskDepartmentBoard() {
  const { t, language } = useLanguage();
  const de = language === 'de';
  const router = useRouter();
  const { hasPermission, isAdmin } = usePermissions();
  const canWrite = isAdmin || hasPermission('tasks:write');

  const { data: departments = [] } = useQuery({
    queryKey: ['tasks', 'departments'],
    queryFn: () => taskService.listDepartments(),
    staleTime: 300_000,
  });
  const [deptId, setDeptId] = useState(null);
  const activeId = deptId || idOf(departments[0]) || null;

  const taskFilters = useMemo(() => ({ ...(activeId ? { departmentId: activeId } : {}), limit: 100 }), [activeId]);
  const { data: tasks = [], isLoading } = useTasks(taskFilters);
  const [createOpen, setCreateOpen] = useState(false);

  const activeDept = departments.find((d) => String(idOf(d)) === String(activeId));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {t('tasks.byDepartment', 'Aufgaben – nach Abteilungen')}
        </h1>
        {canWrite && (
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> {t('tasks.add', 'Aufgabe hinzufügen')}
          </Button>
        )}
      </div>

      {/* Department chips */}
      <div className="flex flex-wrap gap-2">
        {departments.map((d) => {
          const Icon = departmentIcon(d.icon);
          const active = String(idOf(d)) === String(activeId);
          return (
            <button
              key={idOf(d)}
              type="button"
              onClick={() => setDeptId(idOf(d))}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all',
                active ? 'text-white shadow-sm' : 'border-border bg-card text-foreground hover:bg-muted',
              )}
              style={active ? { backgroundColor: d.color || '#6366F1', borderColor: d.color || '#6366F1' } : undefined}
            >
              <Icon className="h-4 w-4" style={!active ? { color: d.color || undefined } : undefined} />
              {d.name}
            </button>
          );
        })}
      </div>

      {/* Task table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : tasks.length === 0 ? (
        <EmptyState icon={ListTodo} title={t('tasks.emptyDept', 'Keine Aufgaben')} description={t('tasks.emptyDeptDesc', 'Für diese Abteilung sind keine Aufgaben vorhanden.')} />
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-4">{t('tasks.col.task', 'Aufgabe')}</TableHead>
                <TableHead>{t('tasks.col.origin', 'Herkunft')}</TableHead>
                <TableHead>{t('tasks.col.priority', 'Priorität')}</TableHead>
                <TableHead>{t('tasks.col.assignee', 'Zugewiesen an')}</TableHead>
                <TableHead>{t('tasks.col.due', 'Fällig')}</TableHead>
                <TableHead>{t('tasks.col.status', 'Status')}</TableHead>
                <TableHead className="text-right">{t('tasks.col.chat', 'Chat')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => <TaskRow key={task._id} task={task} de={de} router={router} />)}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        departments={departments}
        defaultDeptId={activeId}
        de={de}
        t={t}
      />
    </div>
  );
}

function TaskRow({ task, de, router }) {
  const src = sourceMeta(task.source?.type);
  const SrcIcon = src.icon;
  const dept = task.departmentId;
  const DeptIcon = departmentIcon(dept?.icon);
  const assignee = task.assigneeId;
  const status = STATUS_META[task.status] || STATUS_META.OPEN;
  const prio = PRIORITY_META[task.priority] || PRIORITY_META.NONE;
  const subtitle = task.source?.label || task.projectId?.name || task.orderId?.title || null;
  const originLabel = de ? src.labelDe : src.labelEn;
  const listId = idOf(task.listId);

  return (
    <TableRow>
      <TableCell className="px-4">
        <div className="flex items-center gap-2.5">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', src.bg)}>
            <SrcIcon className={cn('h-4 w-4', src.color)} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{task.title}</div>
            {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm font-medium">{originLabel}</div>
        {subtitle && <div className="truncate text-xs text-muted-foreground max-w-[180px]">{subtitle}</div>}
      </TableCell>
      <TableCell>
        <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', prio.color)}>
          <Flag className="h-3.5 w-3.5" /> {de ? prio.de : prio.en}
        </span>
      </TableCell>
      <TableCell>
        {assignee ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{fullName(assignee)}</div>
            {dept?.name && (
              <div className="inline-flex items-center gap-1 text-xs" style={{ color: dept.color || undefined }}>
                <DeptIcon className="h-3 w-3" /> {dept.name}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{fmtDate(task.dueDate)}</TableCell>
      <TableCell>
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', status.cls)}>
          {de ? status.de : status.en}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5"
          onClick={() => listId && router.push(`/tasks/${listId}/${task._id}`)}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Chat
        </Button>
      </TableCell>
    </TableRow>
  );
}

function CreateTaskDialog({ open, onOpenChange, departments, defaultDeptId, de, t }) {
  const qc = useQueryClient();
  const { data: users = [] } = useUserDirectory({ enabled: open });
  const [form, setForm] = useState({ title: '', departmentId: '', priority: 'MEDIUM', assigneeId: '', dueDate: '' });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: (data) => taskService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tasks.all() });
      showSuccess(t('tasks.created', 'Aufgabe erstellt'));
      onOpenChange(false);
      setForm({ title: '', departmentId: '', priority: 'MEDIUM', assigneeId: '', dueDate: '' });
    },
    onError: (e) => showError(e?.message || e),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { showError(t('tasks.titleRequired', 'Titel erforderlich')); return; }
    create.mutate({
      title: form.title.trim(),
      departmentId: form.departmentId || defaultDeptId || undefined,
      priority: form.priority,
      assigneeId: form.assigneeId || undefined,
      dueDate: form.dueDate || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t('tasks.add', 'Aufgabe hinzufügen')}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="t-title">{t('tasks.title', 'Titel')} *</Label>
            <Input id="t-title" value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus disabled={create.isPending} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('tasks.department', 'Abteilung')}</Label>
              <Select value={form.departmentId || String(defaultDeptId || '')} onValueChange={(v) => set('departmentId', v)} disabled={create.isPending}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={idOf(d)} value={String(idOf(d))}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('tasks.col.priority', 'Priorität')}</Label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v)} disabled={create.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTS.map((p) => (
                    <SelectItem key={p} value={p}>{de ? PRIORITY_META[p].de : PRIORITY_META[p].en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('tasks.col.assignee', 'Zugewiesen an')}</Label>
              <Select value={form.assigneeId} onValueChange={(v) => set('assigneeId', v)} disabled={create.isPending}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u._id} value={String(u._id)}>{fullName(u)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-due">{t('tasks.col.due', 'Fällig')}</Label>
              <Input id="t-due" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} disabled={create.isPending} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>{t('common.cancel', 'Abbrechen')}</Button>
            <Button type="submit" className="gap-2" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('common.save', 'Speichern')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
