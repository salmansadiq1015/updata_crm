'use client';

import {
  Activity, Plus, Pencil, Trash2, User, Wrench, Package, StickyNote, Camera, Wallet, CalendarRange,
} from 'lucide-react';
import { useFleetFormat } from '../lib/fleet-meta';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useVehicleHistory } from '@/modules/vehicles/hooks/use-vehicles';

const EVENT_META = {
  'vehicle.created': { icon: Plus, cls: 'bg-emerald-500/10 text-emerald-600', label: 'Fahrzeug erstellt' },
  'vehicle.updated': { icon: Pencil, cls: 'bg-blue-500/10 text-blue-600', label: 'Fahrzeug aktualisiert' },
  'vehicle.deleted': { icon: Trash2, cls: 'bg-red-500/10 text-red-600', label: 'Fahrzeug gelöscht' },
  'vehicle.driver_changed': { icon: User, cls: 'bg-sky-500/10 text-sky-600', label: 'Driver changed' },
  'vehicle.photo_changed': { icon: Camera, cls: 'bg-sky-500/10 text-sky-600', label: 'Photo updated' },
  'vehicle.photo_removed': { icon: Camera, cls: 'bg-red-500/10 text-red-600', label: 'Photo removed' },
  'vehicle.cost_added': { icon: Wallet, cls: 'bg-cyan-500/10 text-cyan-600', label: 'Cost logged' },
  'vehicle.cost_deleted': { icon: Wallet, cls: 'bg-red-500/10 text-red-600', label: 'Cost deleted' },
  'vehicle.booking_created': { icon: CalendarRange, cls: 'bg-sky-500/10 text-sky-600', label: 'Booked' },
  'vehicle.booking_cancelled': { icon: CalendarRange, cls: 'bg-red-500/10 text-red-600', label: 'Booking cancelled' },
  'vehicle.service_added': { icon: Wrench, cls: 'bg-emerald-500/10 text-emerald-600', label: 'Service erfasst' },
  'vehicle.service_deleted': { icon: Wrench, cls: 'bg-red-500/10 text-red-600', label: 'Service gelöscht' },
  'vehicle.material_added': { icon: Package, cls: 'bg-amber-500/10 text-amber-600', label: 'Material hinzugefügt' },
  'vehicle.material_deleted': { icon: Package, cls: 'bg-red-500/10 text-red-600', label: 'Material entfernt' },
  'vehicle.note_added': { icon: StickyNote, cls: 'bg-slate-500/10 text-slate-600', label: 'Notiz hinzugefügt' },
  'vehicle.note_deleted': { icon: StickyNote, cls: 'bg-red-500/10 text-red-600', label: 'Notiz gelöscht' },
};


export function VehicleHistoryTab({ vehicleId }) {
  const { t } = useLanguage();
  const { data: events = [], isLoading } = useVehicleHistory(vehicleId);
  const f = useFleetFormat();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5 pt-1"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (!events.length) {
    return (
      <EmptyState
        icon={Activity}
        title={t('vehicles.history.empty', 'Keine Historie')}
        description={t('vehicles.history.emptyDesc', 'Änderungen an diesem Fahrzeug erscheinen hier.')}
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t('common.activity', 'Aktivität')}</h3>
          <span className="text-xs text-muted-foreground">({events.length})</span>
        </div>
        <div className="relative">
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
          <div className="space-y-3">
            {events.map((e) => {
              const meta = EVENT_META[e.eventType] || { icon: Activity, cls: 'bg-slate-500/10 text-slate-600', label: e.eventType };
              const Icon = meta.icon;
              return (
                <div key={e._id} className="relative flex gap-3">
                  <div className={cn('relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-card', meta.cls)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{t(`vehicles.event.${e.eventType}`, meta.label)}</p>
                      <span className="ml-auto text-[11px] text-muted-foreground">{f.dateTime(e.timestamp)}</span>
                    </div>
                    {e.details?.source === 'ai-agent' && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-200">{t('fleet.history.viaAi', 'via AI assistant')}</span>
                    )}
                    {e.userName && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t('common.by', 'von')} {e.userName}
                      </p>
                    )}
                    {e.details?.changedFields?.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{e.details.changedFields.join(', ')}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
