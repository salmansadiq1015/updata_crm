'use client';

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/shared/components/page-header';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { useVehicles, useVehicleMutations } from '@/modules/vehicles/hooks/use-vehicles';
import { VehiclesTable } from '@/modules/vehicles/components/vehicles-table';
import { VehicleFormDialog } from '@/modules/vehicles/components/vehicle-form-dialog';

const STATUS_FILTERS = ['all', 'available', 'in_use', 'workshop'];

export default function VehiclesPage() {
  const { t } = useLanguage();
  const { hasPermission, isAdmin } = usePermissions();
  const canWrite = isAdmin || hasPermission('vehicles:write');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300).trim();
  const params = useMemo(() => ({
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status !== 'all' ? { status } : {}),
  }), [debouncedSearch, status]);

  const { data: vehicles = [], isLoading } = useVehicles(params);
  const { create } = useVehicleMutations();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={t('vehicles.title', 'Fahrzeuge')}
        description={t('vehicles.pageDesc', 'Verwalten Sie Ihre Fahrzeugflotte, Dokumente, Service und Fahrer.')}
      >
        {canWrite ? (
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('vehicles.add', 'Fahrzeug hinzufügen')}
          </Button>
        ) : null}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('vehicles.searchPlaceholder', 'Kennzeichen, Marke, Modell…')}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'all' ? t('vehicles.status.all', 'Alle Status') : t(`vehicles.status.${s}`, s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <VehiclesTable vehicles={vehicles} loading={isLoading} />

      <VehicleFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => create.mutateAsync(data)}
        isLoading={create.isPending}
      />
    </div>
  );
}
