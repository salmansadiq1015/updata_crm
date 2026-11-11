'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Truck, Pencil, Trash2, Wrench, User, FileText, IdCard, Package, StickyNote, Activity, LayoutGrid, ArrowLeft,
  Gauge, CalendarClock, Sparkles, Camera, ImageOff, Loader2, Wallet, CalendarRange, ShieldCheck, TriangleAlert,
  MapPin, Ellipsis,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useAiStore } from '@/modules/ai/store/ai-store';
import { useVehicle, useVehicleMutations } from '../hooks/use-vehicles';
import {
  driverName, vehicleTitle, vehicleSubtitle, useFleetFormat, ASSET_TYPE_ICONS, FUEL_ICONS,
} from '../lib/fleet-meta';
import { VehicleStatusBadge, PlateBadge, useAlertText } from './vehicle-status-badge';
import { FleetHeroArt } from './fleet-hero';
import { VehicleFormDialog } from './vehicle-form-dialog';
import { VehicleDocumentsPanel } from './vehicle-documents-panel';
import { VehicleServiceTab } from './vehicle-service-tab';
import { VehicleDriverTab } from './vehicle-driver-tab';
import { VehicleMaterialTab } from './vehicle-material-tab';
import { VehicleNotesTab } from './vehicle-notes-tab';
import { VehicleHistoryTab } from './vehicle-history-tab';
import { VehicleOverviewTab } from './vehicle-overview-tab';
import { VehicleCostsTab } from './vehicle-costs-tab';
import { VehicleBookingsTab } from './vehicle-bookings-tab';

const TABS = [
  ['overview', LayoutGrid, 'Overview'],
  ['service', Wrench, 'Service'],
  ['costs', Wallet, 'Costs'],
  ['bookings', CalendarRange, 'Bookings'],
  ['driver', User, 'Driver'],
  ['documents', FileText, 'Documents'],
  ['driverDocs', IdCard, 'Driver documents'],
  ['material', Package, 'Equipment'],
  ['notes', StickyNote, 'Notes'],
  ['history', Activity, 'Activity'],
];

function KpiTile({ icon: Icon, label, value, sub, tone = 'text-sky-500', emphasis }) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border bg-card p-4 sm:p-5', emphasis ? 'border-amber-500/30' : 'border-border')}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-lg bg-muted"><Icon className={cn('size-3.5', tone)} aria-hidden="true" /></span>
        {label}
      </div>
      <p className="mt-2.5 truncate text-xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function VehicleDetail() {
  const { t } = useLanguage();
  const f = useFleetFormat();
  const alertText = useAlertText();
  const { id } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission, isAdmin } = usePermissions();
  const canWrite = isAdmin || hasPermission('vehicles:write');
  const openPanelWithPrompt = useAiStore((s) => s.openPanelWithPrompt);

  const { data: vehicle, isLoading, isError } = useVehicle(id);
  const { update, remove, uploadPhoto, removePhoto } = useVehicleMutations(id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileRef = useRef(null);

  const tab = TABS.some(([k]) => k === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const setTab = (next) => {
    const qs = new URLSearchParams(searchParams.toString());
    if (next === 'overview') qs.delete('tab'); else qs.set('tab', next);
    router.replace(qs.toString() ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (isLoading) return <VehicleDetailSkeleton />;
  if (isError || !vehicle) {
    return (
      <EmptyState
        icon={Truck}
        title={t('fleet.notFound', 'Vehicle not found')}
        description={t('fleet.notFoundDesc', 'It may have been deleted or you lack access.')}
        action={<Button asChild variant="outline"><Link href="/vehicles">{t('fleet.backToList', 'Back to fleet')}</Link></Button>}
      />
    );
  }

  const driver = vehicle.currentDriverId;
  const driverEmployeeId = driver?._id || driver?.id;
  const unit = vehicle.meterUnit || 'km';
  const TypeIcon = ASSET_TYPE_ICONS[vehicle.assetType] || ASSET_TYPE_ICONS.other;
  const FuelIcon = FUEL_ICONS[vehicle.fuelType] || FUEL_ICONS.other;
  const alerts = vehicle.alerts || [];
  const overdue = alerts.filter((a) => a.level === 'overdue');
  const serviceLeft = vehicle.nextServiceKm != null && vehicle.mileageKm != null ? vehicle.nextServiceKm - vehicle.mileageKm : null;

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await uploadPhoto.mutateAsync(file).catch(() => {});
  };

  const askAi = () => openPanelWithPrompt(
    t('fleet.ai.vehiclePrompt', 'For vehicle {plate}: ', { plate: vehicle.kennzeichen }),
  );

  return (
    <div className="space-y-6">
      <Link href="/vehicles" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t('fleet.backToList', 'Back to fleet')}
      </Link>

      {/* Hero */}
      <section className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#060c18] text-white shadow-[0_30px_80px_-40px_rgba(14,165,233,0.45)]">
        {vehicle.imageUrl ? (
          <div className="absolute inset-y-0 end-0 w-full md:w-[62%]">
            {/* eslint-disable-next-line @next/next/no-img-element -- presigned storage URL, WebP-compressed on upload */}
            <img src={vehicle.imageUrl} alt={vehicleTitle(vehicle)} fetchPriority="high" className="h-full w-full object-cover" />
          </div>
        ) : (
          <FleetHeroArt className="opacity-70" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#060c18_0%,rgba(6,12,24,0.95)_34%,rgba(6,12,24,0.45)_70%,rgba(6,12,24,0.2)_100%)] rtl:bg-[linear-gradient(270deg,#060c18_0%,rgba(6,12,24,0.95)_34%,rgba(6,12,24,0.45)_70%,rgba(6,12,24,0.2)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#060c18] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />

        <div className="relative flex min-h-[280px] flex-col justify-between gap-8 p-5 sm:p-8 lg:p-10">
          <div className="flex items-start justify-between gap-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium text-sky-100 backdrop-blur-md">
              <TypeIcon className="size-3.5 text-cyan-300" aria-hidden="true" />
              {t(`fleet.type.${vehicle.assetType || 'car'}`, vehicle.assetType)}
              {vehicle.fleetNumber ? <span className="text-slate-400">· {vehicle.fleetNumber}</span> : null}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={askAi} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3.5 text-sm font-medium text-white backdrop-blur-md transition hover:border-sky-300/40 hover:bg-white/[0.12]">
                <Sparkles className="size-4 text-cyan-300" aria-hidden="true" /><span className="hidden sm:inline">{t('fleet.hero.askAi', 'Ask AI')}</span>
              </button>
              {canWrite ? (
                <>
                  <button type="button" onClick={() => setEditOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-50">
                    <Pencil className="size-3.5" aria-hidden="true" />{t('common.edit', 'Edit')}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/[0.07] text-white backdrop-blur-md hover:bg-white/[0.12]" aria-label={t('common.more', 'More')}>
                        <Ellipsis className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onSelect={() => fileRef.current?.click()}><Camera className="size-4" />{vehicle.imageUrl ? t('fleet.photo.replace', 'Replace photo') : t('fleet.photo.add', 'Add photo')}</DropdownMenuItem>
                      {vehicle.imageUrl ? <DropdownMenuItem onSelect={() => removePhoto.mutate()}><ImageOff className="size-4" />{t('fleet.photo.remove', 'Remove photo')}</DropdownMenuItem> : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}><Trash2 className="size-4" />{t('common.delete', 'Delete')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" className="hidden" onChange={onPhoto} />
                </>
              ) : null}
            </div>
          </div>

          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <PlateBadge plate={vehicle.kennzeichen} size="lg" />
              <VehicleStatusBadge status={vehicle.status} className="border-white/15 bg-white/10 text-white backdrop-blur-md dark:text-white" />
              {uploadPhoto.isPending ? <span className="inline-flex items-center gap-1.5 text-xs text-sky-200"><Loader2 className="size-3.5 animate-spin" />{t('fleet.photo.uploading', 'Optimizing photo…')}</span> : null}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{vehicleTitle(vehicle)}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
              {vehicleSubtitle(vehicle) ? <span>{vehicleSubtitle(vehicle)}</span> : null}
              {vehicle.year ? <span>{vehicle.year}</span> : null}
              <span className="inline-flex items-center gap-1.5"><FuelIcon className="size-4 text-sky-300" aria-hidden="true" />{t(`fleet.fuel.${vehicle.fuelType}`, vehicle.fuelType)}</span>
              <span className="inline-flex items-center gap-1.5 tabular-nums"><Gauge className="size-4 text-sky-300" aria-hidden="true" />{f.meter(vehicle.mileageKm, unit)}</span>
              {vehicle.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-sky-300" aria-hidden="true" />{vehicle.location}</span> : null}
            </div>
          </div>
        </div>
      </section>

      {/* Alerts */}
      {alerts.length ? (
        <div className={cn('flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center', overdue.length ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5')} role="status">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', overdue.length ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300')}>
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {overdue.length ? t('fleet.alerts.overdueTitle', '{count} overdue', { count: overdue.length }) : t('fleet.alerts.soonTitle', 'Coming up in the next 30 days')}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{alerts.map(alertText).join(' · ')}</p>
          </div>
          {canWrite ? <Button size="sm" variant="outline" className="rounded-full" onClick={() => setTab('service')}>{t('fleet.service.add', 'Log service')}</Button> : null}
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile icon={Gauge} label={unit === 'h' ? t('fleet.field.hours', 'Operating hours') : t('fleet.field.mileage', 'Mileage')} value={f.meter(vehicle.mileageKm, unit)} sub={vehicle.lastServiceKm != null ? t('fleet.kpi.sinceService', '{value} since last service', { value: f.meter(Math.max(0, (vehicle.mileageKm || 0) - vehicle.lastServiceKm), unit) }) : null} />
        <KpiTile
          icon={CalendarClock}
          label={t('fleet.kpi.nextService', 'Next service')}
          value={vehicle.nextServiceDate ? f.date(vehicle.nextServiceDate) : vehicle.nextServiceKm != null ? f.meter(vehicle.nextServiceKm, unit) : '—'}
          sub={serviceLeft != null ? (serviceLeft < 0 ? t('fleet.kpi.meterOver', '{value} overdue', { value: f.meter(-serviceLeft, unit) }) : t('fleet.kpi.meterLeft', '{value} to go', { value: f.meter(serviceLeft, unit) })) : vehicle.lastServiceDate ? t('fleet.kpi.lastServiceOn', 'Last: {date}', { date: f.date(vehicle.lastServiceDate) }) : null}
          tone="text-cyan-500"
          emphasis={alerts.some((a) => a.kind === 'service')}
        />
        <KpiTile icon={User} label={t('fleet.field.driver', 'Driver')} value={driverName(driver) || t('fleet.driver.none', 'No driver')} sub={driver?.email || null} />
        <KpiTile
          icon={ShieldCheck}
          label={t('fleet.kpi.compliance', 'Compliance')}
          value={alerts.length ? (overdue.length ? t('fleet.health.overdue', 'Overdue') : t('fleet.health.due_soon', 'Due soon')) : t('fleet.health.ok', 'All clear')}
          sub={vehicle.insuranceExpiry ? t('fleet.kpi.insuredUntil', 'Insured until {date}', { date: f.date(vehicle.insuranceExpiry) }) : null}
          tone={overdue.length ? 'text-rose-500' : alerts.length ? 'text-amber-500' : 'text-emerald-500'}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <TabsList variant="line" className="w-max">
            {TABS.map(([key, Icon, label]) => (
              <TabsTrigger key={key} value={key} className="gap-1.5"><Icon className="size-3.5" />{t(`fleet.tab.${key}`, label)}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview"><VehicleOverviewTab vehicle={vehicle} /></TabsContent>
        <TabsContent value="service"><VehicleServiceTab vehicleId={id} vehicle={vehicle} canWrite={canWrite} /></TabsContent>
        <TabsContent value="costs"><VehicleCostsTab vehicle={vehicle} canWrite={canWrite} /></TabsContent>
        <TabsContent value="bookings"><VehicleBookingsTab vehicle={vehicle} canWrite={canWrite} /></TabsContent>
        <TabsContent value="driver"><VehicleDriverTab vehicleId={id} driver={driver} canWrite={canWrite} /></TabsContent>
        <TabsContent value="documents">
          <VehicleDocumentsPanel
            filters={{ source: 'repository', sourceRecordType: 'vehicle', sourceRecordId: id }}
            metadata={{ sourceRecordType: 'vehicle', sourceRecordId: id }}
            canWrite={canWrite}
            canDelete={canWrite}
            description={t('fleet.docs.vehicleDesc', 'Registration, insurance policy, leasing contract, inspection reports — all in one place.')}
          />
        </TabsContent>
        <TabsContent value="driverDocs">
          {driverEmployeeId ? (
            <VehicleDocumentsPanel
              filters={{ source: 'repository', employeeId: driverEmployeeId }}
              metadata={{ employeeId: driverEmployeeId }}
              canWrite={canWrite}
              canDelete={canWrite}
              description={t('fleet.docs.driverDesc', 'Driving licence and permits — stored once on the person, visible on every vehicle they drive.')}
            />
          ) : (
            <EmptyState icon={IdCard} title={t('fleet.driverDocs.noDriver', 'No driver assigned')} description={t('fleet.driverDocs.noDriverDesc', 'Assign a driver in the Driver tab to manage their documents.')} />
          )}
        </TabsContent>
        <TabsContent value="material"><VehicleMaterialTab vehicleId={id} kennzeichen={vehicle.kennzeichen} canWrite={canWrite} /></TabsContent>
        <TabsContent value="notes"><VehicleNotesTab vehicleId={id} canWrite={canWrite} /></TabsContent>
        <TabsContent value="history"><VehicleHistoryTab vehicleId={id} /></TabsContent>
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
        title={t('fleet.deleteTitle', 'Delete vehicle?')}
        description={t('fleet.deleteDesc', '“{name}” is removed from the fleet and its future bookings are cancelled. History stays in the audit log.', { name: vehicle.kennzeichen })}
        confirmText={t('common.delete', 'Delete')}
        variant="destructive"
        onConfirm={async () => { await remove.mutateAsync(id); router.push('/vehicles'); }}
        isLoading={remove.isPending}
      />
    </div>
  );
}

function VehicleDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-4 w-28" />
      <div className="h-[280px] rounded-[28px] bg-[#060c18]" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
      </div>
      <Skeleton className="h-10 w-full max-w-3xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
