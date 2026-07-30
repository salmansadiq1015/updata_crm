'use client';

import { useState } from 'react';
import { Plus, Wrench, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { useVehicleServices, useVehicleMutations } from '@/modules/vehicles/hooks/use-vehicles';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtKm = (v) => (v == null || v === '' ? null : `${Number(v).toLocaleString('de-CH')} km`);

export function VehicleServiceTab({ vehicleId, canWrite = false }) {
  const { t } = useLanguage();
  const { data: entries = [], isLoading } = useVehicleServices(vehicleId);
  const { addService, deleteService } = useVehicleMutations(vehicleId);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ date: '', mileageKm: '', description: '', garage: '', cost: '' });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.description.trim()) {
      showError(t('vehicles.service.required', 'Datum und Beschreibung sind erforderlich'));
      return;
    }
    try {
      await addService.mutateAsync({
        date: form.date,
        description: form.description.trim(),
        mileageKm: form.mileageKm !== '' ? Number(form.mileageKm) : undefined,
        garage: form.garage.trim() || undefined,
        cost: form.cost !== '' ? Number(form.cost) : undefined,
      });
      setForm({ date: '', mileageKm: '', description: '', garage: '', cost: '' });
      setOpen(false);
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('vehicles.tab.service', 'Service & Wartung')}</h3>
        {canWrite && (
          <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t('vehicles.service.add', 'Service erfassen')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : entries.length === 0 ? (
        <EmptyState icon={Wrench} title={t('vehicles.service.empty', 'Keine Serviceeinträge')} description={t('vehicles.service.emptyDesc', 'Erfassen Sie durchgeführte Services und Wartungen.')} />
      ) : (
        <div className="space-y-2">
          {entries.map((s) => (
            <Card key={s._id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                  <Wrench className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="text-sm font-medium">{fmtDate(s.date)}</span>
                    {fmtKm(s.mileageKm) && <span className="text-xs text-muted-foreground">{fmtKm(s.mileageKm)}</span>}
                    {s.garage && <span className="text-xs text-muted-foreground">· {s.garage}</span>}
                    {s.cost != null && <span className="text-xs text-muted-foreground">· CHF {Number(s.cost).toLocaleString('de-CH', { minimumFractionDigits: 2 })}</span>}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{s.description}</p>
                </div>
                {canWrite && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('vehicles.service.add', 'Service erfassen')}</DialogTitle>
            <DialogDescription>{t('vehicles.service.addDesc', 'Der jüngste Eintrag aktualisiert automatisch den letzten Service.')}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-date">{t('vehicles.service.date', 'Datum')} *</Label>
                <Input id="s-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} disabled={addService.isPending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-km">{t('vehicles.service.mileage', 'Kilometerstand')}</Label>
                <Input id="s-km" type="number" value={form.mileageKm} onChange={(e) => set('mileageKm', e.target.value)} disabled={addService.isPending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-garage">{t('vehicles.service.garage', 'Garage')}</Label>
                <Input id="s-garage" value={form.garage} onChange={(e) => set('garage', e.target.value)} disabled={addService.isPending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-cost">{t('vehicles.service.cost', 'Kosten (CHF)')}</Label>
                <Input id="s-cost" type="number" step="0.01" value={form.cost} onChange={(e) => set('cost', e.target.value)} disabled={addService.isPending} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-desc">{t('vehicles.service.description', 'Beschreibung')} *</Label>
              <Textarea id="s-desc" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} disabled={addService.isPending} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={addService.isPending}>{t('common.cancel', 'Abbrechen')}</Button>
              <Button type="submit" className="gap-2" disabled={addService.isPending}>
                {addService.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t('common.save', 'Speichern')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('vehicles.service.deleteTitle', 'Serviceeintrag löschen?')}
        description={t('vehicles.service.deleteDesc', 'Dieser Eintrag wird dauerhaft entfernt.')}
        confirmText={t('common.delete', 'Löschen')}
        variant="destructive"
        onConfirm={async () => { await deleteService.mutateAsync(deleteTarget._id); setDeleteTarget(null); }}
        isLoading={deleteService.isPending}
      />
    </div>
  );
}
