'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Truck, Pencil, Trash2, Fuel, Calendar, Gauge, Wrench, User, ClipboardCheck,
  FileText, IdCard, Package, StickyNote, Activity, LayoutGrid, Hash, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useVehicle, useVehicleMutations } from '@/modules/vehicles/hooks/use-vehicles';
import { VehicleStatusBadge } from './vehicle-status-badge';
import { VehicleFormDialog } from './vehicle-form-dialog';
import { VehicleDocumentsPanel } from './vehicle-documents-panel';
import { VehicleServiceTab } from './vehicle-service-tab';
import { VehicleDriverTab } from './vehicle-driver-tab';
import { VehicleMaterialTab } from './vehicle-material-tab';
import { VehicleNotesTab } from './vehicle-notes-tab';
import { VehicleHistoryTab } from './vehicle-history-tab';

const fmtKm = (v) => (v == null ? '—' : `${Number(v).toLocaleString('de-CH')} km`);
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const driverName = (d) => (d ? [d.firstName, d.lastName].filter(Boolean).join(' ') : null);

function KpiCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', accent)} /> {label}
      </div>
      <p className="mt-1.5 truncate text-lg font-semibold text-foreground">{value}</p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="truncate text-sm font-medium text-foreground">{value || '—'}</span>
    </div>
  );
}

export function VehicleDetail() {
  const { t } = useLanguage();
  const { id } = useParams();
  const router = useRouter();
  const { hasPermission, isAdmin } = usePermissions();
  const canWrite = isAdmin || hasPermission('vehicles:write');

  const { data: vehicle, isLoading } = useVehicle(id);
  const { update, remove } = useVehicleMutations(id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) return <VehicleDetailSkeleton />;
  if (!vehicle) {
    return <EmptyState icon={Truck} title={t('vehicles.notFound', 'Fahrzeug nicht gefunden')} description={t('vehicles.notFoundDesc', 'Das angeforderte Fahrzeug existiert nicht.')} />;
  }

  const driver = vehicle.currentDriverId;
  const model = [vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const driverEmployeeId = driver?._id || driver?.id;

  return (
    <div className="space-y-6">
      {/* Back to list */}
      <Link
        href="/vehicles"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('vehicles.backToList', 'Zurück zu Fahrzeuge')}
      </Link>

      {/* Hero header */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-1 w-full bg-linear-to-r from-brand-500 via-brand-400 to-transparent" />
        <div className="flex flex-wrap items-start gap-4 p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 ring-1 ring-brand-500/20">
            <Truck className="h-7 w-7 text-brand-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-tight text-foreground">{vehicle.kennzeichen}</h1>
              <VehicleStatusBadge status={vehicle.status} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground">
              {(vehicle.label || model) && <span className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> {vehicle.label || model}{vehicle.label && model ? ` · ${model}` : ''}</span>}
              <span className="inline-flex items-center gap-1.5"><Fuel className="h-3.5 w-3.5" /> {t(`vehicles.fuel.${vehicle.fuelType}`, vehicle.fuelType)}</span>
              {vehicle.year && <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {vehicle.year}</span>}
              <span className="inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> {fmtKm(vehicle.mileageKm)}</span>
            </div>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> {t('common.edit', 'Bearbeiten')}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" /> {t('common.delete', 'Löschen')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Wrench} accent="text-emerald-600" label={t('vehicles.kpi.lastService', 'Letzter Service')} value={fmtDate(vehicle.lastServiceDate)} sub={vehicle.lastServiceGarage || (vehicle.lastServiceKm != null ? fmtKm(vehicle.lastServiceKm) : '')} />
        <KpiCard icon={Calendar} accent="text-sky-600" label={t('vehicles.kpi.nextService', 'Nächster Service')} value={fmtDate(vehicle.nextServiceDate)} sub={vehicle.nextServiceKm != null ? fmtKm(vehicle.nextServiceKm) : ''} />
        <KpiCard icon={User} accent="text-violet-600" label={t('vehicles.kpi.driver', 'Aktueller Fahrer')} value={driverName(driver) || t('vehicles.driver.none', 'Kein Fahrer')} />
        <KpiCard icon={ClipboardCheck} accent="text-amber-600" label={t('vehicles.field.status', 'Status')} value={t(`vehicles.status.${vehicle.status}`, vehicle.status)} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="overview" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" /> {t('vehicles.tab.overview', 'Übersicht')}</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> {t('vehicles.tab.documents', 'Fahrzeugdokumente')}</TabsTrigger>
          <TabsTrigger value="service" className="gap-1.5"><Wrench className="h-3.5 w-3.5" /> {t('vehicles.tab.service', 'Service & Wartung')}</TabsTrigger>
          <TabsTrigger value="driver" className="gap-1.5"><User className="h-3.5 w-3.5" /> {t('vehicles.tab.driver', 'Fahrer')}</TabsTrigger>
          <TabsTrigger value="driverDocs" className="gap-1.5"><IdCard className="h-3.5 w-3.5" /> {t('vehicles.tab.driverDocs', 'Fahrerunterlagen')}</TabsTrigger>
          <TabsTrigger value="material" className="gap-1.5"><Package className="h-3.5 w-3.5" /> {t('vehicles.tab.material', 'Materialliste')}</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5"><StickyNote className="h-3.5 w-3.5" /> {t('vehicles.tab.notes', 'Notizen')}</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> {t('common.activity', 'Aktivität')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-2 text-sm font-semibold">{t('vehicles.overview.details', 'Fahrzeugdaten')}</h3>
              <div className="divide-y divide-border">
                <InfoRow icon={Hash} label={t('vehicles.field.kennzeichen', 'Kennzeichen')} value={vehicle.kennzeichen} />
                <InfoRow icon={Truck} label={t('vehicles.col.vehicle', 'Fahrzeug')} value={model || vehicle.label} />
                <InfoRow icon={Fuel} label={t('vehicles.field.fuelType', 'Treibstoff')} value={t(`vehicles.fuel.${vehicle.fuelType}`, vehicle.fuelType)} />
                <InfoRow icon={Calendar} label={t('vehicles.field.year', 'Baujahr')} value={vehicle.year} />
                <InfoRow icon={Gauge} label={t('vehicles.field.mileageKm', 'Kilometerstand')} value={fmtKm(vehicle.mileageKm)} />
                <InfoRow icon={Hash} label={t('vehicles.field.vin', 'VIN')} value={vehicle.vin} />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-2 text-sm font-semibold">{t('vehicles.overview.serviceDriver', 'Service & Fahrer')}</h3>
              <div className="divide-y divide-border">
                <InfoRow icon={Wrench} label={t('vehicles.kpi.lastService', 'Letzter Service')} value={fmtDate(vehicle.lastServiceDate)} />
                <InfoRow icon={Calendar} label={t('vehicles.kpi.nextService', 'Nächster Service')} value={fmtDate(vehicle.nextServiceDate)} />
                <InfoRow icon={User} label={t('vehicles.kpi.driver', 'Aktueller Fahrer')} value={driverName(driver)} />
                {driver?.email && <InfoRow icon={User} label="E-Mail" value={driver.email} />}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <VehicleDocumentsPanel
            filters={{ source: 'repository', sourceRecordType: 'vehicle', sourceRecordId: id }}
            metadata={{ sourceRecordType: 'vehicle', sourceRecordId: id }}
            canWrite={canWrite}
            canDelete={canWrite}
            description={t('vehicles.docs.vehicleDesc', 'Zentrale Ablage aller Fahrzeugdokumente (Fahrzeugausweis, Versicherung, …).')}
          />
        </TabsContent>

        <TabsContent value="service">
          <VehicleServiceTab vehicleId={id} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="driver">
          <VehicleDriverTab vehicleId={id} driver={driver} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="driverDocs">
          {driverEmployeeId ? (
            <VehicleDocumentsPanel
              filters={{ source: 'repository', employeeId: driverEmployeeId }}
              metadata={{ employeeId: driverEmployeeId }}
              canWrite={canWrite}
              canDelete={canWrite}
              description={t('vehicles.docs.driverDesc', 'Fahrerunterlagen (Führerausweis, Grenzgängerbewilligung, …) — zentral auf der Person abgelegt.')}
            />
          ) : (
            <EmptyState icon={IdCard} title={t('vehicles.driverDocs.noDriver', 'Kein Fahrer zugewiesen')} description={t('vehicles.driverDocs.noDriverDesc', 'Weisen Sie zuerst im Tab „Fahrer" einen Fahrer zu, um dessen Unterlagen zu verwalten.')} />
          )}
        </TabsContent>

        <TabsContent value="material">
          <VehicleMaterialTab vehicleId={id} kennzeichen={vehicle.kennzeichen} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="notes">
          <VehicleNotesTab vehicleId={id} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="history">
          <VehicleHistoryTab vehicleId={id} />
        </TabsContent>
      </Tabs>

      <VehicleFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        defaultValues={vehicle}
        onSubmit={(data) => update.mutateAsync({ vehicleId: id, data })}
        isLoading={update.isPending}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('vehicles.deleteTitle', 'Fahrzeug löschen?')}
        description={t('vehicles.deleteDesc', 'Möchten Sie das Fahrzeug "{name}" wirklich löschen?', { name: vehicle.kennzeichen })}
        confirmText={t('common.delete', 'Löschen')}
        variant="destructive"
        onConfirm={async () => { await remove.mutateAsync(id); router.push('/vehicles'); }}
        isLoading={remove.isPending}
      />
    </div>
  );
}

function VehicleDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-1 w-full bg-brand-500/40" />
        <div className="flex gap-4 p-6">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="flex-1 space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-80" /></div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-10 w-full max-w-2xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
