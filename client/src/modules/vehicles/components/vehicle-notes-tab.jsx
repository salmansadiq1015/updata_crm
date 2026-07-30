'use client';

import { useState } from 'react';
import { Plus, StickyNote, Trash2, Loader2, AlertTriangle, Wrench, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { useVehicleNotes, useVehicleMutations } from '@/modules/vehicles/hooks/use-vehicles';

const CATEGORIES = ['general', 'warning', 'service', 'other'];
const CAT_META = {
  general: { icon: Info, cls: 'bg-slate-500/10 text-slate-600' },
  warning: { icon: AlertTriangle, cls: 'bg-red-500/10 text-red-600' },
  service: { icon: Wrench, cls: 'bg-emerald-500/10 text-emerald-600' },
  other: { icon: StickyNote, cls: 'bg-blue-500/10 text-blue-600' },
};

const authorName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export function VehicleNotesTab({ vehicleId, canWrite = false }) {
  const { t } = useLanguage();
  const { data: notes = [], isLoading } = useVehicleNotes(vehicleId);
  const { addNote, deleteNote } = useVehicleMutations(vehicleId);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ body: '', category: 'general' });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.body.trim()) {
      showError(t('vehicles.notes.required', 'Bitte Text eingeben'));
      return;
    }
    try {
      await addNote.mutateAsync({ body: form.body.trim(), category: form.category });
      setForm({ body: '', category: 'general' });
      setOpen(false);
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('vehicles.tab.notes', 'Notizen')}</h3>
        {canWrite && (
          <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t('vehicles.notes.add', 'Notiz hinzufügen')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : notes.length === 0 ? (
        <EmptyState icon={StickyNote} title={t('vehicles.notes.empty', 'Keine Notizen')} description={t('vehicles.notes.emptyDesc', 'Halten Sie wichtige Hinweise zum Fahrzeug fest.')} />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const meta = CAT_META[n.category] || CAT_META.general;
            const Icon = meta.icon;
            return (
              <Card key={n._id}>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', meta.cls)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t(`vehicles.noteCategory.${n.category}`, n.category)}
                      {authorName(n.createdBy) && ` · ${authorName(n.createdBy)}`}
                      {n.createdAt && ` · ${fmtDate(n.createdAt)}`}
                    </p>
                  </div>
                  {canWrite && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(n)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t('vehicles.notes.add', 'Notiz hinzufügen')}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label>{t('vehicles.notes.category', 'Kategorie')}</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))} disabled={addNote.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{t(`vehicles.noteCategory.${c}`, c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="n-body">{t('vehicles.notes.body', 'Notiz')} *</Label>
              <Textarea id="n-body" rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} disabled={addNote.isPending} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={addNote.isPending}>{t('common.cancel', 'Abbrechen')}</Button>
              <Button type="submit" className="gap-2" disabled={addNote.isPending}>
                {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t('common.save', 'Speichern')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('vehicles.notes.deleteTitle', 'Notiz löschen?')}
        description={t('vehicles.notes.deleteDesc', 'Diese Notiz wird dauerhaft entfernt.')}
        confirmText={t('common.delete', 'Löschen')}
        variant="destructive"
        onConfirm={async () => { await deleteNote.mutateAsync(deleteTarget._id); setDeleteTarget(null); }}
        isLoading={deleteNote.isPending}
      />
    </div>
  );
}
