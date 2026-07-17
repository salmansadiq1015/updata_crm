'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { showSuccess, showError } from '@/lib/toast';
import { useDepartmentsAdmin, useDepartmentMutations } from '../hooks/use-departments';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Building2, Plus, Pencil, Power } from 'lucide-react';

const BLANK = { name: '', code: '', isActive: true };

export function DepartmentAdminPage() {
  const { t } = useLanguage();
  const { data: departments = [], isLoading } = useDepartmentsAdmin();
  const { createDepartment, updateDepartment } = useDepartmentMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);

  const isPending = createDepartment.isPending || updateDepartment.isPending;

  const openCreate = () => { setEditing(null); setForm(BLANK); setDialogOpen(true); };
  const openEdit = (dept) => {
    setEditing(dept);
    setForm({ name: dept.name || '', code: dept.code || '', isActive: dept.isActive });
    setDialogOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      if (editing) {
        await updateDepartment.mutateAsync({ id: editing._id, data: { name: form.name.trim(), isActive: form.isActive } });
        showSuccess(t('qop.departments.updatedToast', 'Abteilung aktualisiert'));
      } else {
        await createDepartment.mutateAsync({ name: form.name.trim(), code: form.code.trim().toUpperCase() });
        showSuccess(t('qop.departments.createdToast', 'Abteilung erstellt'));
      }
      setDialogOpen(false);
    } catch (err) {
      showError(err);
    }
  };

  const toggleActive = async (dept) => {
    try {
      await updateDepartment.mutateAsync({ id: dept._id, data: { isActive: !dept.isActive } });
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('qop.departments.title', 'Abteilungen')}
        description={t('qop.departments.desc', 'Abteilungen für Offerten, Aufträge und Rechnungen verwalten. Mindestens eine ist nötig, um Dokumente zu erstellen.')}
        icon={Building2}
        count={departments.length}
      >
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> {t('qop.departments.new', 'Neue Abteilung')}
        </Button>
      </PageHeader>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('qop.departments.name', 'Name')}</TableHead>
              <TableHead>{t('qop.departments.code', 'Kürzel')}</TableHead>
              <TableHead>{t('common.status', 'Status')}</TableHead>
              <TableHead className="text-right">{t('common.actions', 'Aktionen')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ))
            ) : departments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                  {t('qop.departments.empty', 'Noch keine Abteilungen. Erstellen Sie die erste, um Offerten erstellen zu können.')}
                </TableCell>
              </TableRow>
            ) : (
              departments.map((dept) => (
                <TableRow key={dept._id}>
                  <TableCell className="font-medium text-foreground">{dept.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{dept.code}</TableCell>
                  <TableCell>
                    {dept.isActive ? (
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                        {t('common.active', 'Aktiv')}
                      </Badge>
                    ) : (
                      <Badge className="border-border bg-muted text-muted-foreground">
                        {t('common.inactive', 'Inaktiv')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openEdit(dept)}>
                        <Pencil className="h-3.5 w-3.5" /> {t('common.edit', 'Bearbeiten')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => toggleActive(dept)}
                        disabled={isPending}
                      >
                        <Power className="h-3.5 w-3.5" />
                        {dept.isActive ? t('common.deactivate', 'Deaktivieren') : t('common.activate', 'Aktivieren')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {editing ? t('qop.departments.edit', 'Abteilung bearbeiten') : t('qop.departments.new', 'Neue Abteilung')}
              </DialogTitle>
              <DialogDescription>
                {t('qop.departments.dialogDesc', 'Abteilungen strukturieren die Nummerierung von Offerten, Aufträgen und Rechnungen.')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="dept-name">{t('qop.departments.name', 'Name')}</Label>
                <Input
                  id="dept-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. Heizung"
                  maxLength={100}
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-code">{t('qop.departments.code', 'Kürzel')}</Label>
                <Input
                  id="dept-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="z.B. HZ"
                  maxLength={20}
                  disabled={!!editing}
                  required={!editing}
                />
                <p className="text-xs text-muted-foreground">
                  {editing
                    ? t('qop.departments.codeLocked', 'Das Kürzel kann nach der Erstellung nicht geändert werden.')
                    : t('qop.departments.codeHint', 'Nur Buchstaben/Zahlen. Erscheint in der Belegnummerierung.')}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                {t('common.cancel', 'Abbrechen')}
              </Button>
              <Button type="submit" disabled={isPending || !form.name.trim() || (!editing && !form.code.trim())}>
                {editing ? t('common.save', 'Speichern') : t('common.create', 'Erstellen')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
