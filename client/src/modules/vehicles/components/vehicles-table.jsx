'use client';

import { useRouter } from 'next/navigation';
import { Truck, Fuel, User, Calendar, Gauge } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { useLanguage } from '@/lib/i18n/language-context';
import { VehicleStatusBadge } from './vehicle-status-badge';

const driverName = (d) => (d ? [d.firstName, d.lastName].filter(Boolean).join(' ') : null);
const fmtKm = (v) => (v == null ? '—' : `${Number(v).toLocaleString('de-CH')} km`);
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function VehiclesTable({ vehicles = [], loading = false }) {
  const { t } = useLanguage();
  const router = useRouter();

  if (!loading && !vehicles.length) {
    return (
      <EmptyState
        icon={Truck}
        title={t('vehicles.empty.title', 'Keine Fahrzeuge')}
        description={t('vehicles.empty.desc', 'Fügen Sie Ihr erstes Fahrzeug hinzu, um die Flotte zu verwalten.')}
      />
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-background">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="px-4">{t('vehicles.field.kennzeichen', 'Kennzeichen')}</TableHead>
            <TableHead>{t('vehicles.col.vehicle', 'Fahrzeug')}</TableHead>
            <TableHead>{t('vehicles.field.status', 'Status')}</TableHead>
            <TableHead>{t('vehicles.field.driver', 'Fahrer')}</TableHead>
            <TableHead>{t('vehicles.field.mileageKm', 'Kilometerstand')}</TableHead>
            <TableHead>{t('vehicles.field.nextService', 'Nächster Service')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            : vehicles.map((v) => {
                const dn = driverName(v.currentDriverId);
                const model = [v.make, v.model].filter(Boolean).join(' ');
                return (
                  <TableRow
                    key={v._id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/vehicles/${v._id}`)}
                  >
                    <TableCell className="px-4 font-medium">{v.kennzeichen}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{v.label || model || '—'}</div>
                          {v.label && model && (
                            <div className="truncate text-xs text-muted-foreground">{model}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><VehicleStatusBadge status={v.status} /></TableCell>
                    <TableCell>
                      {dn ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <User className="h-3.5 w-3.5 text-muted-foreground" /> {dn}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> {fmtKm(v.mileageKm)}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {fmtDate(v.nextServiceDate)}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
        </TableBody>
      </Table>
    </div>
  );
}
