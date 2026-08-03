'use client';

import { useState } from 'react';
import { User, UserPlus, UserX, Mail, Phone, Loader2, Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';
import { useVehicleMutations } from '@/modules/vehicles/hooks/use-vehicles';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';

const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '');
const initials = (u) => `${(u?.firstName || '')[0] || ''}${(u?.lastName || '')[0] || ''}`.toUpperCase() || '?';

export function VehicleDriverTab({ vehicleId, driver, canWrite = false }) {
  const { t } = useLanguage();
  const { assignDriver } = useVehicleMutations(vehicleId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const change = async (driverId) => {
    try {
      await assignDriver.mutateAsync({ vehicleId, driverId });
      setPickerOpen(false);
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('vehicles.tab.driver', 'Aktueller Fahrer')}</h3>
        {canWrite && (
          <div className="flex gap-2">
            <Button size="sm" className="gap-2" onClick={() => setPickerOpen(true)}>
              <UserPlus className="h-4 w-4" /> {driver ? t('vehicles.driver.change', 'Fahrer wechseln') : t('vehicles.driver.assign', 'Fahrer zuweisen')}
            </Button>
            {driver && (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => change(null)} disabled={assignDriver.isPending}>
                <UserX className="h-4 w-4" /> {t('vehicles.driver.unassign', 'Entfernen')}
              </Button>
            )}
          </div>
        )}
      </div>

      {driver ? (
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-base font-semibold">{initials(driver)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">{fullName(driver)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                {driver.email && (
                  <a href={`mailto:${driver.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <Mail className="h-3.5 w-3.5" /> {driver.email}
                  </a>
                )}
                {(driver.mobile || driver.phone) && (
                  <a href={`tel:${driver.mobile || driver.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <Phone className="h-3.5 w-3.5" /> {driver.mobile || driver.phone}
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={User} title={t('vehicles.driver.none', 'Kein Fahrer zugewiesen')} description={t('vehicles.driver.noneDesc', 'Weisen Sie diesem Fahrzeug einen Mitarbeiter als Fahrer zu.')} />
      )}

      <DriverPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentId={driver?._id}
        onSelect={change}
        busy={assignDriver.isPending}
      />
    </div>
  );
}

function DriverPickerDialog({ open, onOpenChange, currentId, onSelect, busy }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250);
  const { data: users = [], isLoading } = useUserDirectory({ search: debounced, enabled: open });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('vehicles.driver.pick', 'Fahrer auswählen')}</DialogTitle>
          <DialogDescription>{t('vehicles.driver.pickDesc', 'Wählen Sie einen Mitarbeiter als aktuellen Fahrer.')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('vehicles.driver.searchPlaceholder', 'Mitarbeiter suchen…')} className="pl-9" autoFocus />
        </div>
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading', 'Wird geladen…')}</p>
          ) : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('vehicles.driver.noResults', 'Keine Mitarbeiter gefunden')}</p>
          ) : (
            users.map((u) => {
              const active = String(u._id) === String(currentId);
              return (
                <button
                  key={u._id}
                  type="button"
                  disabled={busy}
                  onClick={() => onSelect(u._id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60',
                    active && 'bg-muted',
                  )}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs font-semibold">{initials(u)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{fullName(u)}</p>
                    {u.email && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
                  </div>
                  {active && <Check className="h-4 w-4 text-brand-600" />}
                  {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
