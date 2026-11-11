'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gauge, CalendarClock, MapPin, ChevronRight, UserRound } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  driverName, vehicleTitle, vehicleSubtitle, useFleetFormat, HEALTH_TONES, FUEL_ICONS,
} from '../lib/fleet-meta';
import {
  VehicleStatusBadge, PlateBadge, VehicleAvatar, VehicleAlertChips,
} from './vehicle-status-badge';

const href = (v) => `/vehicles/${v._id}`;

export function VehicleCard({ vehicle: v }) {
  const { t } = useLanguage();
  const f = useFleetFormat();
  const driver = driverName(v.currentDriverId);
  const FuelIcon = FUEL_ICONS[v.fuelType] || FUEL_ICONS.other;
  const service = v.nextServiceDate ? f.date(v.nextServiceDate) : v.nextServiceKm != null ? f.meter(v.nextServiceKm, v.meterUnit) : '—';

  return (
    <Link
      href={href(v)}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-500/30 hover:shadow-[0_18px_40px_-20px_rgba(14,165,233,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-900 via-[#0b1830] to-[#07101f]">
        {v.imageUrl ? (
          <VehicleAvatar vehicle={v} rounded="" className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.28),transparent_55%)]" />
            <VehicleAvatar vehicle={v} rounded="rounded-2xl" className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 bg-white/5 ring-white/10" iconClassName="size-8 text-sky-200" />
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute left-3 top-3"><VehicleStatusBadge status={v.status} className="border-white/20 bg-black/40 text-white backdrop-blur-md dark:text-white" /></div>
        <div className="absolute bottom-3 left-3"><PlateBadge plate={v.kennzeichen} size="sm" /></div>
        {v.health && v.health !== 'ok' ? (
          <span className={cn('absolute right-3 top-3 size-2.5 rounded-full ring-4', v.health === 'overdue' ? 'bg-rose-500 ring-rose-500/25' : 'bg-amber-400 ring-amber-400/25')} aria-label={t(`fleet.health.${v.health}`, v.health)} />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">{vehicleTitle(v)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span>{t(`fleet.type.${v.assetType || 'car'}`, v.assetType)}</span>
            {vehicleSubtitle(v) ? <><span aria-hidden="true">·</span><span className="truncate">{vehicleSubtitle(v)}</span></> : null}
            {v.year ? <><span aria-hidden="true">·</span><span>{v.year}</span></> : null}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><Gauge className="size-3.5 shrink-0" aria-hidden="true" /><dd className="truncate tabular-nums text-foreground">{f.meter(v.mileageKm, v.meterUnit)}</dd></div>
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><FuelIcon className="size-3.5 shrink-0" aria-hidden="true" /><dd className="truncate text-foreground">{t(`fleet.fuel.${v.fuelType}`, v.fuelType)}</dd></div>
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><UserRound className="size-3.5 shrink-0" aria-hidden="true" /><dd className="truncate text-foreground">{driver || t('fleet.driver.none', 'No driver')}</dd></div>
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><CalendarClock className="size-3.5 shrink-0" aria-hidden="true" /><dd className={cn('truncate', v.health ? HEALTH_TONES[v.health] : 'text-foreground')}>{service}</dd></div>
        </dl>

        {v.alerts?.length ? <VehicleAlertChips alerts={v.alerts} max={1} className="mt-auto" /> : v.location ? (
          <p className="mt-auto flex items-center gap-1.5 truncate text-xs text-muted-foreground"><MapPin className="size-3.5" aria-hidden="true" />{v.location}</p>
        ) : null}
      </div>
    </Link>
  );
}

export function VehicleCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="space-y-3 p-4"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /><div className="grid grid-cols-2 gap-2"><Skeleton className="h-3" /><Skeleton className="h-3" /><Skeleton className="h-3" /><Skeleton className="h-3" /></div></div>
    </div>
  );
}

export function VehiclesTable({ vehicles = [], loading = false }) {
  const { t } = useLanguage();
  const f = useFleetFormat();
  const router = useRouter();

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="ps-5">{t('fleet.col.vehicle', 'Vehicle')}</TableHead>
              <TableHead>{t('fleet.field.plate', 'Plate')}</TableHead>
              <TableHead>{t('fleet.field.status', 'Status')}</TableHead>
              <TableHead>{t('fleet.field.driver', 'Driver')}</TableHead>
              <TableHead className="text-end">{t('fleet.field.meter', 'Meter')}</TableHead>
              <TableHead>{t('fleet.col.attention', 'Due')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="ps-5"><div className="flex items-center gap-3"><Skeleton className="size-11 rounded-xl" /><div className="space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div></div></TableCell>
                    {Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                  </TableRow>
                ))
              : vehicles.map((v) => {
                  const dn = driverName(v.currentDriverId);
                  return (
                    <TableRow
                      key={v._id}
                      tabIndex={0}
                      className="group cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
                      onClick={() => router.push(href(v))}
                      onKeyDown={(e) => { if (e.key === 'Enter') router.push(href(v)); }}
                    >
                      <TableCell className="ps-5">
                        <div className="flex items-center gap-3">
                          <VehicleAvatar vehicle={v} className="size-11 shrink-0" iconClassName="size-5" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{vehicleTitle(v)}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {t(`fleet.type.${v.assetType || 'car'}`, v.assetType)}{vehicleSubtitle(v) ? ` · ${vehicleSubtitle(v)}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><PlateBadge plate={v.kennzeichen} size="sm" /></TableCell>
                      <TableCell><VehicleStatusBadge status={v.status} /></TableCell>
                      <TableCell>
                        {dn ? <span className="text-sm text-foreground">{dn}</span> : <span className="text-sm text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-end text-sm tabular-nums text-foreground">{f.meter(v.mileageKm, v.meterUnit)}</TableCell>
                      <TableCell>
                        {v.alerts?.length ? <VehicleAlertChips alerts={v.alerts} max={1} /> : (
                          <span className="text-xs text-muted-foreground">{v.nextServiceDate ? f.date(v.nextServiceDate) : '—'}</span>
                        )}
                      </TableCell>
                      <TableCell><ChevronRight className="size-4 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground rtl:rotate-180" aria-hidden="true" /></TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
