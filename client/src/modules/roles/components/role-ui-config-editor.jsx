'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, MonitorPlay, Save } from 'lucide-react';
import { roleService } from '@/modules/roles/services/role-service';
import { queryKeys } from '@/lib/query/keys';
import { useUiPreviewStore } from '@/stores/ui-preview-store';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';

// Top-level sidebar modules (id = group key or leaf href — must match sidebar.jsx).
const MODULE_CATALOG = [
  { id: '/dashboard', label: 'Dashboard' },
  { id: '/settings/users', label: 'Mitarbeiterverwaltung' },
  { id: 'crm', label: 'CRM' },
  { id: '/projects', label: 'Projekte' },
  { id: 'scheduling', label: 'Einsatzplanung' },
  { id: 'sales', label: 'Offerten & Aufträge' },
  { id: 'finance', label: 'Buchhaltung' },
  { id: 'catalog', label: 'Katalog' },
  { id: '/documents', label: 'Dokumente' },
  { id: '/vehicles', label: 'Fahrzeuge' },
  { id: '/tasks', label: 'Aufgaben' },
  { id: '/notifications', label: 'Benachrichtigungen' },
  { id: '/ai', label: 'KI-Assistent' },
  { id: '/field-ops/orders', label: 'Einsätze' },
  { id: '/field-ops/reports', label: 'Arbeitsberichte' },
  { id: '/field-ops/time', label: 'Zeiterfassung' },
  { id: '/field-ops/chat', label: 'Global-Chat' },
];

const START_PAGES = [
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/tasks', label: 'Aufgaben' },
  { value: '/projects', label: 'Projekte' },
  { value: '/crm/sites', label: 'Objekte' },
  { value: '/crm/customers', label: 'Kunden' },
  { value: '/scheduling/calendar', label: 'Einsatzplanung' },
  { value: '/quotes', label: 'Offerten & Aufträge' },
  { value: '/documents', label: 'Dokumente' },
  { value: '/vehicles', label: 'Fahrzeuge' },
  { value: '/field-ops/orders', label: 'Einsätze' },
];

const orderedCatalog = (sidebarOrder) => {
  if (!sidebarOrder?.length) return MODULE_CATALOG.map((m) => m.id);
  const rank = new Map(sidebarOrder.map((id, i) => [id, i]));
  return [...MODULE_CATALOG]
    .sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 1000 + MODULE_CATALOG.findIndex((m) => m.id === a.id))
      - (rank.has(b.id) ? rank.get(b.id) : 1000 + MODULE_CATALOG.findIndex((m) => m.id === b.id)))
    .map((m) => m.id);
};

/**
 * Rollenabhängige Startseite — Key-User editor: start page, sidebar order and
 * module visibility, plus default filters/view for the Aufgaben workspace. The
 * config applies to every user of the role; personal preferences still win.
 */
export function RoleUiConfigEditor({ role }) {
  const { t } = useLanguage();
  const router = useRouter();
  const qc = useQueryClient();
  const setPreview = useUiPreviewStore((s) => s.setPreview);

  const cfg = role?.uiConfig?.desktop || {};
  const [startPage, setStartPage] = useState(cfg.startPage || '/dashboard');
  const [order, setOrder] = useState(() => orderedCatalog(cfg.sidebarOrder));
  const [hidden, setHidden] = useState(() => new Set(cfg.hiddenModules || []));
  const [taskDefaults, setTaskDefaults] = useState({
    assigneeFilter: cfg.taskDefaults?.assigneeFilter || 'ALL',
    savedView: cfg.taskDefaults?.savedView || 'none',
    status: cfg.taskDefaults?.status || 'ALL',
    view: cfg.taskDefaults?.view || 'list',
  });

  // Re-sync when another role is opened.
  useEffect(() => {
    const c = role?.uiConfig?.desktop || {};
    setStartPage(c.startPage || '/dashboard');
    setOrder(orderedCatalog(c.sidebarOrder));
    setHidden(new Set(c.hiddenModules || []));
    setTaskDefaults({
      assigneeFilter: c.taskDefaults?.assigneeFilter || 'ALL',
      savedView: c.taskDefaults?.savedView || 'none',
      status: c.taskDefaults?.status || 'ALL',
      view: c.taskDefaults?.view || 'list',
    });
  }, [role?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(MODULE_CATALOG.map((m) => [m.id, m])), []);

  const buildConfig = () => ({
    startPage,
    sidebarOrder: order,
    hiddenModules: [...hidden],
    taskDefaults: {
      assigneeFilter: taskDefaults.assigneeFilter === 'ALL' ? null : taskDefaults.assigneeFilter,
      savedView: taskDefaults.savedView === 'none' ? null : taskDefaults.savedView,
      status: taskDefaults.status === 'ALL' ? null : taskDefaults.status,
      view: taskDefaults.view === 'list' ? null : taskDefaults.view,
    },
  });

  const save = useMutation({
    mutationFn: () => roleService.updateRole(role._id, { uiConfig: { ...(role.uiConfig || {}), desktop: buildConfig() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.all() });
      showSuccess(t('roles.uiConfigSaved', 'Startseite & Navigation gespeichert'));
    },
    onError: (e) => showError(e?.message || e),
  });

  const move = (id, dir) => {
    setOrder((prev) => {
      const idx = prev.indexOf(id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  };

  const toggleHidden = (id) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const previewAsRole = () => {
    setPreview({ roleId: role._id, roleName: role.name, config: { desktop: buildConfig() } });
    router.push(startPage || '/dashboard');
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {/* Left: start page + task defaults */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('roles.startPage', 'Standard-Startseite')}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('roles.startPageDesc', 'Diese Seite öffnet sich für alle Benutzer dieser Rolle nach der Anmeldung. Persönliche Einstellungen haben Vorrang.')}
            </p>
          </CardHeader>
          <CardContent>
            <Select value={startPage} onValueChange={setStartPage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {START_PAGES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('roles.taskDefaults', 'Standardfilter Aufgaben')}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('roles.taskDefaultsDesc', 'Vorbelegte Filter und Ansicht beim Öffnen der Aufgaben (z. B. «Meine Aufgaben → Heute → Offen»).')}
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('roles.taskAssignee', 'Zugewiesen')}</Label>
              <Select value={taskDefaults.assigneeFilter} onValueChange={(v) => setTaskDefaults((d) => ({ ...d, assigneeFilter: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('roles.taskAll', 'Alle Aufgaben')}</SelectItem>
                  <SelectItem value="ME">{t('roles.taskMine', 'Meine Aufgaben')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('roles.taskSavedView', 'Zeitraum')}</Label>
              <Select value={taskDefaults.savedView} onValueChange={(v) => setTaskDefaults((d) => ({ ...d, savedView: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('roles.taskNoFilter', 'Ohne Filter')}</SelectItem>
                  <SelectItem value="dueToday">{t('roles.taskToday', 'Heute fällig')}</SelectItem>
                  <SelectItem value="overdue">{t('roles.taskOverdue', 'Überfällig')}</SelectItem>
                  <SelectItem value="pool">{t('roles.taskPool', 'Aufgabenpool')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={taskDefaults.status} onValueChange={(v) => setTaskDefaults((d) => ({ ...d, status: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('roles.taskAllStatuses', 'Alle Status')}</SelectItem>
                  <SelectItem value="OPEN">{t('roles.taskOpen', 'Offen')}</SelectItem>
                  <SelectItem value="IN_PROGRESS">{t('roles.taskInProgress', 'In Bearbeitung')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('roles.taskView', 'Standardansicht')}</Label>
              <Select value={taskDefaults.view} onValueChange={(v) => setTaskDefaults((d) => ({ ...d, view: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="list">{t('roles.viewList', 'Liste')}</SelectItem>
                  <SelectItem value="board">Board</SelectItem>
                  <SelectItem value="calendar">{t('roles.viewCalendar', 'Kalender')}</SelectItem>
                  <SelectItem value="timeline">Timeline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button className="gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('common.save', 'Speichern')}
          </Button>
          <Button variant="outline" className="gap-2" onClick={previewAsRole}>
            <MonitorPlay className="h-4 w-4" />
            {t('roles.previewButton', 'Als diese Rolle anzeigen')}
          </Button>
        </div>
      </div>

      {/* Right: module order + visibility */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('roles.modules', 'Menüpunkte & Reihenfolge')}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('roles.modulesDesc', 'Reihenfolge per Pfeil ändern, Auge blendet den Menüpunkt für diese Rolle aus. Berechtigungen gelten weiterhin.')}
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {order.map((id, idx) => {
            const mod = byId.get(id);
            if (!mod) return null;
            const isHidden = hidden.has(id);
            return (
              <div
                key={id}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5',
                  isHidden ? 'bg-muted/40 opacity-60' : 'bg-card',
                )}
              >
                <span className="w-5 text-center text-[11px] tabular-nums text-muted-foreground">{idx + 1}</span>
                <span className={cn('min-w-0 flex-1 truncate text-sm', isHidden && 'line-through')}>{mod.label}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => move(id, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === order.length - 1} onClick={() => move(id, 1)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleHidden(id)} title={isHidden ? t('roles.showModule', 'Einblenden') : t('roles.hideModule', 'Ausblenden')}>
                  {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
