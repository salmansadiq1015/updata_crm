'use client';

import { useState } from 'react';
import { Plus, Package, Trash2, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { downloadBlob } from '@/lib/api/download';
import { vehicleService } from '@/modules/vehicles/services/vehicle-service';
import { useVehicleMaterials, useVehicleMutations } from '@/modules/vehicles/hooks/use-vehicles';

export function VehicleMaterialTab({ vehicleId, kennzeichen, canWrite = false }) {
  const { t } = useLanguage();
  const { data: items = [], isLoading } = useVehicleMaterials(vehicleId);
  const { addMaterial, deleteMaterial } = useVehicleMutations(vehicleId);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({ name: '', quantity: '1', unit: '', note: '' });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const blob = await vehicleService.exportMaterialsPdf(vehicleId);
      const plate = (kennzeichen || 'Fahrzeug').replace(/\s+/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      downloadBlob(blob, `Materialliste_${plate}_${dateStr}.pdf`, 'application/pdf');
    } catch (err) {
      showError(err);
    } finally {
      setExporting(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showError(t('vehicles.material.required', 'Bezeichnung ist erforderlich'));
      return;
    }
    try {
      await addMaterial.mutateAsync({
        name: form.name.trim(),
        quantity: form.quantity !== '' ? Number(form.quantity) : 1,
        unit: form.unit.trim() || undefined,
        note: form.note.trim() || undefined,
      });
      setForm({ name: '', quantity: '1', unit: '', note: '' });
      setOpen(false);
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('vehicles.tab.material', 'Materialliste')}</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={handleExportPdf} disabled={items.length === 0 || exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t('vehicles.material.exportPdf', 'PDF exportieren')}
          </Button>
          {canWrite && (
            <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> {t('vehicles.material.add', 'Material hinzufügen')}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Package} title={t('vehicles.material.empty', 'Keine Materialien')} description={t('vehicles.material.emptyDesc', 'Erfassen Sie die feste Materialausrüstung dieses Fahrzeugs.')} />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="px-4">{t('vehicles.material.name', 'Bezeichnung')}</TableHead>
                <TableHead className="w-[120px]">{t('vehicles.material.quantity', 'Menge')}</TableHead>
                <TableHead>{t('vehicles.material.note', 'Notiz')}</TableHead>
                {canWrite && <TableHead className="w-[60px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m._id}>
                  <TableCell className="px-4 font-medium">{m.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.quantity}{m.unit ? ` ${m.unit}` : ''}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.note || '—'}</TableCell>
                  {canWrite && (
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(m)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('vehicles.material.add', 'Material hinzufügen')}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="m-name">{t('vehicles.material.name', 'Bezeichnung')} *</Label>
              <Input id="m-name" value={form.name} onChange={(e) => set('name', e.target.value)} disabled={addMaterial.isPending} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="m-qty">{t('vehicles.material.quantity', 'Menge')}</Label>
                <Input id="m-qty" type="number" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} disabled={addMaterial.isPending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-unit">{t('vehicles.material.unit', 'Einheit')}</Label>
                <Input id="m-unit" value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder={t('vehicles.material.unitPlaceholder', 'Stk, m, …')} disabled={addMaterial.isPending} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-note">{t('vehicles.material.note', 'Notiz')}</Label>
              <Input id="m-note" value={form.note} onChange={(e) => set('note', e.target.value)} disabled={addMaterial.isPending} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={addMaterial.isPending}>{t('common.cancel', 'Abbrechen')}</Button>
              <Button type="submit" className="gap-2" disabled={addMaterial.isPending}>
                {addMaterial.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t('common.save', 'Speichern')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('vehicles.material.deleteTitle', 'Material löschen?')}
        description={deleteTarget ? t('vehicles.material.deleteDesc', '"{name}" wird entfernt.', { name: deleteTarget.name }) : ''}
        confirmText={t('common.delete', 'Löschen')}
        variant="destructive"
        onConfirm={async () => { await deleteMaterial.mutateAsync(deleteTarget._id); setDeleteTarget(null); }}
        isLoading={deleteMaterial.isPending}
      />
    </div>
  );
}
