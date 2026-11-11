'use client';

import { useState } from 'react';
import { Plus, Wrench, Trash2, Loader2, Hammer, BadgeCheck, CircleDot, Paintbrush, Sparkles, Cog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { useVehicleServices, useVehicleMutations } from '../hooks/use-vehicles';
import { VEHICLE_SERVICE_TYPES, CURRENCIES, useFleetFormat } from '../lib/fleet-meta';

const TYPE_ICONS = { maintenance: Wrench, repair: Hammer, inspection: BadgeCheck, tires: CircleDot, bodywork: Paintbrush, cleaning: Sparkles, other: Cog };
const today = () => new Date().toISOString().slice(0, 10);
const blank = (currency) => ({ type: 'maintenance', date: today(), mileageKm: '', description: '', garage: '', cost: '', currency, invoiceNumber: '', nextServiceDate: '', nextServiceKm: '' });

export function VehicleServiceTab({ vehicleId, vehicle, canWrite = false }) {
  const { t } = useLanguage();
  const f = useFleetFormat();
  const unit = vehicle?.meterUnit || 'km';
  const { data: entries = [], isLoading } = useVehicleServices(vehicleId);
  const { addService, deleteService } = useVehicleMutations(vehicleId);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(() => blank(vehicle?.currency || 'CHF'));
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const totalCost = entries.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.description.trim()) {
      showError(t('fleet.service.required', 'Date and description are required'));
      return;
    }
    try {
      await addService.mutateAsync({
        type: form.type,
        date: form.date,
        description: form.description.trim(),
        ...(form.mileageKm !== '' ? { mileageKm: Number(form.mileageKm) } : {}),
        ...(form.garage.trim() ? { garage: form.garage.trim() } : {}),
        ...(form.cost !== '' ? { cost: Number(form.cost), currency: form.currency } : {}),
        ...(form.invoiceNumber.trim() ? { invoiceNumber: form.invoiceNumber.trim() } : {}),
        ...(form.nextServiceDate ? { nextServiceDate: form.nextServiceDate } : {}),
        ...(form.nextServiceKm !== '' ? { nextServiceKm: Number(form.nextServiceKm) } : {}),
      });
      setForm(blank(vehicle?.currency || 'CHF'));
      setOpen(false);
    } catch { /* toast from the mutation */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entries.length ? t('fleet.service.summary', '{count} entries · {cost} in total', { count: entries.length, cost: f.money(totalCost, vehicle?.currency || 'CHF') }) : t('fleet.service.hint', 'The newest entry updates the last-service tiles automatically.')}
        </p>
        {canWrite && <Button size="sm" className="gap-2 rounded-full" onClick={() => setOpen(true)}><Plus className="size-4" /> {t('fleet.service.add', 'Log service')}</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : entries.length === 0 ? (
        <EmptyState icon={Wrench} title={t('fleet.service.empty', 'No service history yet')} description={t('fleet.service.emptyDesc', 'Log maintenance, repairs, inspections and tyre changes.')} />
      ) : (
        <ol className="relative space-y-3 before:absolute before:bottom-4 before:start-[19px] before:top-4 before:w-px before:bg-border">
          {entries.map((s) => {
            const Icon = TYPE_ICONS[s.type] || Wrench;
            return (
              <li key={s._id} className="relative flex gap-4">
                <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-card ring-1 ring-border"><Icon className="size-4 text-sky-600 dark:text-sky-300" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-foreground">{f.date(s.date)}</span>
                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-200">{t(`fleet.serviceType.${s.type || 'maintenance'}`, s.type)}</span>
                    {s.mileageKm != null ? <span className="text-xs tabular-nums text-muted-foreground">{f.meter(s.mileageKm, unit)}</span> : null}
                    {s.garage ? <span className="text-xs text-muted-foreground">· {s.garage}</span> : null}
                    <span className="ms-auto flex items-center gap-2">
                      {s.cost != null ? <span className="text-sm font-semibold tabular-nums text-foreground">{f.money(s.cost, s.currency || vehicle?.currency || 'CHF', 2)}</span> : null}
                      {canWrite && (
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(s)} aria-label={t('common.delete', 'Delete')}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">{s.description}</p>
                  {s.invoiceNumber ? <p className="mt-1 text-xs text-muted-foreground">{t('fleet.field.invoiceNumber', 'Invoice no.')} {s.invoiceNumber}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('fleet.service.add', 'Log service')}</DialogTitle>
            <DialogDescription>{t('fleet.service.addDesc', 'The newest entry updates the last service; a higher meter reading updates the vehicle.')}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{t('fleet.field.serviceType', 'Type')}</Label>
                <Select value={form.type} onValueChange={(v) => set('type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VEHICLE_SERVICE_TYPES.map((x) => <SelectItem key={x} value={x}>{t(`fleet.serviceType.${x}`, x)}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="s-date">{t('fleet.field.date', 'Date')} *</Label><Input id="s-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} disabled={addService.isPending} /></div>
              <div className="space-y-1.5"><Label htmlFor="s-km">{t('fleet.field.meterReading', 'Meter reading ({unit})', { unit })}</Label><Input id="s-km" type="number" min="0" value={form.mileageKm} onChange={(e) => set('mileageKm', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="s-garage">{t('fleet.field.garage', 'Workshop')}</Label><Input id="s-garage" value={form.garage} onChange={(e) => set('garage', e.target.value)} /></div>
              <div className="grid grid-cols-[1fr_92px] gap-2">
                <div className="space-y-1.5"><Label htmlFor="s-cost">{t('fleet.field.cost', 'Cost')}</Label><Input id="s-cost" type="number" step="0.01" min="0" value={form.cost} onChange={(e) => set('cost', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>{t('fleet.field.currency', 'Currency')}</Label>
                  <Select value={form.currency} onValueChange={(v) => set('currency', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="s-inv">{t('fleet.field.invoiceNumber', 'Invoice no.')}</Label><Input id="s-inv" value={form.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="s-desc">{t('fleet.field.workDone', 'Work done')} *</Label><Textarea id="s-desc" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
            <div className="grid gap-4 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="s-nd">{t('fleet.field.nextServiceDate', 'Next service (date)')}</Label><Input id="s-nd" type="date" value={form.nextServiceDate} onChange={(e) => set('nextServiceDate', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="s-nk">{t('fleet.field.nextServiceMeter', 'Next service at ({unit})', { unit })}</Label><Input id="s-nk" type="number" min="0" value={form.nextServiceKm} onChange={(e) => set('nextServiceKm', e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={addService.isPending}>{t('common.cancel', 'Cancel')}</Button>
              <Button type="submit" className="gap-2" disabled={addService.isPending}>
                {addService.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{t('common.save', 'Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('fleet.service.deleteTitle', 'Delete service entry?')}
        description={t('fleet.service.deleteDesc', 'The last-service tiles are recalculated from the remaining entries.')}
        confirmText={t('common.delete', 'Delete')}
        variant="destructive"
        onConfirm={async () => { await deleteService.mutateAsync(deleteTarget._id); setDeleteTarget(null); }}
        isLoading={deleteService.isPending}
      />
    </div>
  );
}
