'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';

const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid', 'other'];
const STATUSES = ['available', 'in_use', 'workshop'];

const emptyForm = {
  kennzeichen: '', label: '', make: '', model: '', vin: '',
  fuelType: 'diesel', year: '', mileageKm: '', status: 'available',
  nextServiceDate: '', nextServiceKm: '',
};

const toDateInput = (v) => (v ? String(v).slice(0, 10) : '');

export function VehicleFormDialog({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(emptyForm);
  const isEdit = !!defaultValues?._id;

  useEffect(() => {
    if (!open) return;
    setForm(defaultValues
      ? {
          kennzeichen: defaultValues.kennzeichen || '',
          label: defaultValues.label || '',
          make: defaultValues.make || '',
          model: defaultValues.model || '',
          vin: defaultValues.vin || '',
          fuelType: defaultValues.fuelType || 'diesel',
          year: defaultValues.year != null ? String(defaultValues.year) : '',
          mileageKm: defaultValues.mileageKm != null ? String(defaultValues.mileageKm) : '',
          status: defaultValues.status || 'available',
          nextServiceDate: toDateInput(defaultValues.nextServiceDate),
          nextServiceKm: defaultValues.nextServiceKm != null ? String(defaultValues.nextServiceKm) : '',
        }
      : emptyForm);
  }, [open, defaultValues]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.kennzeichen.trim()) {
      showError(t('vehicles.form.kennzeichenRequired', 'Kennzeichen ist erforderlich'));
      return;
    }
    const payload = {
      kennzeichen: form.kennzeichen.trim(),
      label: form.label.trim() || undefined,
      make: form.make.trim() || undefined,
      model: form.model.trim() || undefined,
      vin: form.vin.trim() || undefined,
      fuelType: form.fuelType,
      status: form.status,
      year: form.year ? Number(form.year) : undefined,
      mileageKm: form.mileageKm !== '' ? Number(form.mileageKm) : undefined,
      nextServiceDate: form.nextServiceDate || undefined,
      nextServiceKm: form.nextServiceKm !== '' ? Number(form.nextServiceKm) : undefined,
    };
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      showError(err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('vehicles.form.editTitle', 'Fahrzeug bearbeiten') : t('vehicles.form.createTitle', 'Fahrzeug hinzufügen')}
          </DialogTitle>
          <DialogDescription>
            {t('vehicles.form.desc', 'Erfassen Sie die Stammdaten des Fahrzeugs.')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="v-kennzeichen">{t('vehicles.field.kennzeichen', 'Kennzeichen')} *</Label>
              <Input id="v-kennzeichen" value={form.kennzeichen} onChange={(e) => set('kennzeichen', e.target.value)} placeholder="ZH 123 456" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-label">{t('vehicles.field.label', 'Bezeichnung')}</Label>
              <Input id="v-label" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder={t('vehicles.field.labelPlaceholder', 'z. B. Servicebus 1')} disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-make">{t('vehicles.field.make', 'Marke')}</Label>
              <Input id="v-make" value={form.make} onChange={(e) => set('make', e.target.value)} placeholder="VW" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-model">{t('vehicles.field.model', 'Modell')}</Label>
              <Input id="v-model" value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="Transporter" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>{t('vehicles.field.fuelType', 'Treibstoff')}</Label>
              <Select value={form.fuelType} onValueChange={(v) => set('fuelType', v)} disabled={isLoading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>{t(`vehicles.fuel.${ft}`, ft)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('vehicles.field.status', 'Status')}</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)} disabled={isLoading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`vehicles.status.${s}`, s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-year">{t('vehicles.field.year', 'Baujahr')}</Label>
              <Input id="v-year" type="number" value={form.year} onChange={(e) => set('year', e.target.value)} placeholder="2022" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-mileage">{t('vehicles.field.mileageKm', 'Kilometerstand')}</Label>
              <Input id="v-mileage" type="number" value={form.mileageKm} onChange={(e) => set('mileageKm', e.target.value)} placeholder="45000" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-vin">{t('vehicles.field.vin', 'Fahrgestellnummer (VIN)')}</Label>
              <Input id="v-vin" value={form.vin} onChange={(e) => set('vin', e.target.value)} disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-nextServiceDate">{t('vehicles.field.nextServiceDate', 'Nächster Service (Datum)')}</Label>
              <Input id="v-nextServiceDate" type="date" value={form.nextServiceDate} onChange={(e) => set('nextServiceDate', e.target.value)} disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-nextServiceKm">{t('vehicles.field.nextServiceKm', 'Nächster Service (km)')}</Label>
              <Input id="v-nextServiceKm" type="number" value={form.nextServiceKm} onChange={(e) => set('nextServiceKm', e.target.value)} placeholder="60000" disabled={isLoading} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" className="gap-2" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('common.save', 'Speichern')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
