'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search, Trash2, RefreshCw, AlertTriangle, Building2, FileText,
  Users as UsersIcon, MapPinned, Receipt, PackageCheck, Filter, Download,
} from 'lucide-react';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Alle Kunden' },
  { value: 'empty', label: 'Ohne Aktivität (0)' },
  { value: 'low', label: 'Wenig Aktivität (1-2)' },
  { value: 'active', label: 'Mit Aktivität (3+)' },
  { value: 'inactive', label: 'Deaktiviert' },
  { value: 'deleted', label: 'Gelöscht (soft)' },
  { value: 'declined', label: 'Nur Absagen' },
];

function filterCustomers(customers, filter, search) {
  let filtered = customers;

  if (filter === 'empty') filtered = filtered.filter((c) => c.totalActivity === 0);
  else if (filter === 'low') filtered = filtered.filter((c) => c.totalActivity >= 1 && c.totalActivity <= 2);
  else if (filter === 'active') filtered = filtered.filter((c) => c.totalActivity >= 3);
  else if (filter === 'inactive') filtered = filtered.filter((c) => c.status === 'inactive');
  else if (filter === 'deleted') filtered = filtered.filter((c) => c.isDeleted);
  else if (filter === 'declined') filtered = filtered.filter((c) => c.hasDeclined && c.totalActivity <= 1);

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.customerNumber || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q),
    );
  }

  return filtered;
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-xl border px-4 py-3',
      'bg-card/50',
    )}>
      <div className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg',
        accent === 'red' && 'bg-destructive/10 text-destructive',
        accent === 'amber' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        accent === 'emerald' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        accent === 'sky' && 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function CleanupWorkspace() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: customers = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.crm.customers.cleanupAudit(),
    queryFn: () => customerService.getCleanupAudit(),
    staleTime: 5 * 60 * 1000,
  });

  const bulkArchive = useMutation({
    mutationFn: (ids) => customerService.bulkArchive(ids),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.customers.all() });
      const n = res?.deactivatedCount ?? selected.size;
      showSuccess(`${n} Kunden archiviert`);
      setSelected(new Set());
      setShowConfirm(false);
    },
    onError: (err) => showError(err.message),
  });

  const filtered = useMemo(
    () => filterCustomers(customers, filter, search),
    [customers, filter, search],
  );

  const stats = useMemo(() => {
    const total = customers.length;
    const empty = customers.filter((c) => c.totalActivity === 0).length;
    const archived = customers.filter((c) => c.status === 'inactive').length;
    const withActivity = customers.filter((c) => c.totalActivity > 0).length;
    return { total, empty, archived, withActivity };
  }, [customers]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c._id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c._id)));
    }
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = () => {
    if (selected.size === 0) return;
    setShowConfirm(true);
  };

  const confirmDelete = () => {
    bulkArchive.mutate([...selected]);
  };

  const exportSelection = () => {
    const rows = filtered.filter((c) => selected.has(c._id));
    if (rows.length === 0) return;
    const sep = ';';
    const header = ['KundenNr', 'Name', 'Typ', 'Status', 'Stadt', 'Standorte', 'Kontakte', 'Offerten', 'Aufträge', 'Rechnungen', 'Total'].join(sep);
    const body = rows.map((c) => [
      c.customerNumber, c.name, c.type, c.status, c.city,
      c.sitesCount, c.contactsCount, c.quotationsCount, c.ordersCount, c.invoicesCount,
      c.totalActivity,
    ].join(sep)).join('\n');
    const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleanup-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Kundendaten werden analysiert...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Fehler beim Laden der Daten.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Erneut laden
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label="Total Kunden" value={stats.total} accent="sky" />
        <StatCard icon={AlertTriangle} label="Ohne Aktivität" value={stats.empty} accent="red" />
        <StatCard icon={FileText} label="Mit Aktivität" value={stats.withActivity} accent="emerald" />
        <StatCard icon={Trash2} label="Bereits archiviert" value={stats.archived} accent="amber" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name, Nummer, Stadt..."
            className="h-9 pl-9 rounded-lg text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-9 w-[200px] rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {selected.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={exportSelection}>
                <Download className="h-3.5 w-3.5 mr-1.5" />CSV
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={bulkArchive.isPending}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {selected.size} archivieren
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} von {customers.length} Kunden angezeigt
        {selected.size > 0 && ` — ${selected.size} ausgewählt`}
      </p>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Nr.</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Typ</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Stadt</th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground" title="Standorte">
                  <MapPinned className="h-3.5 w-3.5 mx-auto" />
                </th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground" title="Kontakte">
                  <UsersIcon className="h-3.5 w-3.5 mx-auto" />
                </th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground" title="Offerten">
                  <FileText className="h-3.5 w-3.5 mx-auto" />
                </th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground" title="Aufträge">
                  <PackageCheck className="h-3.5 w-3.5 mx-auto" />
                </th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground" title="Rechnungen">
                  <Receipt className="h-3.5 w-3.5 mx-auto" />
                </th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-muted-foreground">
                    Keine Kunden gefunden.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr
                  key={c._id}
                  className={cn(
                    'border-b last:border-b-0 transition-colors hover:bg-muted/30',
                    selected.has(c._id) && 'bg-primary/5',
                  )}
                >
                  <td className="w-10 px-3 py-2">
                    <Checkbox
                      checked={selected.has(c._id)}
                      onCheckedChange={() => toggleOne(c._id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.customerNumber}</td>
                  <td className="px-3 py-2 font-medium max-w-[250px] truncate">{c.name}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px] font-normal capitalize">
                      {c.type === 'business' ? 'Firma' : 'Privat'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] font-normal',
                        c.status === 'active' && 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
                        c.status === 'inactive' && 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
                        c.isDeleted && 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
                      )}
                    >
                      {c.isDeleted ? 'Gelöscht' : c.status === 'inactive' ? 'Deaktiviert' : 'Aktiv'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.city || '—'}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{c.sitesCount}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{c.contactsCount}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{c.quotationsCount}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{c.ordersCount}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{c.invoicesCount}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn(
                      'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                      c.totalActivity === 0
                        ? 'bg-destructive/10 text-destructive'
                        : c.totalActivity <= 2
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    )}>
                      {c.totalActivity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kunden archivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.size} Kunde(n) werden als archiviert markiert.
              Die Daten bleiben erhalten und können bei Bedarf wiederhergestellt werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkArchive.isPending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={bulkArchive.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkArchive.isPending ? 'Wird deaktiviert...' : `${selected.size} deaktivieren`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
