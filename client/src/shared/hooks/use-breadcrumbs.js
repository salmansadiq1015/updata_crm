'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useBreadcrumbStore } from '@/stores/breadcrumb-store';

// Mongo ObjectId (24 hex) or UUID — never render these raw.
const ID_SEGMENT = /^(?:[a-f0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const labelMap = {
  dashboard: { key: 'sidebar.dashboard', fallback: 'Dashboard' },
  settings: { key: 'sidebar.settings', fallback: 'Settings' },
  users: { key: 'sidebar.users', fallback: 'Users' },
  roles: { key: 'sidebar.roles', fallback: 'Roles' },
  profile: { key: 'userMenu.profile', fallback: 'Profile' },
  crm: { key: 'sidebar.crm', fallback: 'CRM' },
  customers: { key: 'sidebar.customers', fallback: 'Customers' },
  sites: { key: 'sidebar.sites', fallback: 'Objekte' },
  installations: { key: 'crm.installations.title', fallback: 'Komponenten' },
  contacts: { key: 'sidebar.contacts', fallback: 'Kontakte' },
  'address-book': { key: 'sidebar.addressBook', fallback: 'Adressbuch' },
  newsletters: { key: 'sidebar.newsletters', fallback: 'Newsletter' },
  procurement: { key: 'sidebar.procurement', fallback: 'Beschaffung' },
  'asset-maintenance': { key: 'sidebar.assetMaintenance', fallback: 'Komponenten & Wartungen' },
  projects: { key: 'sidebar.projects', fallback: 'Projects' },
  tasks: { key: 'sidebar.tasks', fallback: 'Tasks' },
  all: { key: 'tasks.allTasks', fallback: 'Alle Aufgaben' },
  scheduling: { key: 'sidebar.scheduling', fallback: 'Scheduling' },
  accounting: { key: 'sidebar.accounting', fallback: 'Accounting' },
  catalog: { key: 'sidebar.catalog', fallback: 'Catalog' },
  documents: { key: 'sidebar.documents', fallback: 'Dokumente' },
  notifications: { key: 'sidebar.notifications', fallback: 'Notifications' },
  // Field ops
  'field-ops': { key: 'sidebar.fieldOps', fallback: 'Feldeinsatz' },
  orders: { key: 'sidebar.fieldOpsOrders', fallback: 'Einsätze' },
  reports: { key: 'sidebar.fieldOpsReports', fallback: 'Arbeitsberichte' },
  time: { key: 'sidebar.fieldOpsTime', fallback: 'Zeiterfassung' },
  chat: { key: 'sidebar.fieldOpsChat', fallback: 'Global-Chat' },
  // Administration
  admin: { key: 'sidebar.admin', fallback: 'Verwaltung' },
  audit: { key: 'sidebar.audit', fallback: 'Audit-Protokoll' },
  departments: { key: 'sidebar.departments', fallback: 'Abteilungen' },
  templates: { key: 'sidebar.templates', fallback: 'Vorlagen' },
  integrations: { key: 'sidebar.integrations', fallback: 'Integrationen' },
};

export function useBreadcrumbs() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const labels = useBreadcrumbStore((state) => state.labels);

  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const crumbs = segments.map((segment, index) => {
      const path = '/' + segments.slice(0, index + 1).join('/');

      // Id segments show what the detail page published: either a name, or a
      // whole ancestry chain (Kunde › Objekt › Anlage) the URL cannot express.
      // Until it is known, drop the crumb instead of exposing a raw id.
      if (ID_SEGMENT.test(segment)) {
        const resolved = labels[segment];
        if (Array.isArray(resolved)) {
          return resolved.map((crumb, position) => ({
            label: crumb.label,
            path: crumb.path || `${path}#${position}`,
          }));
        }
        return resolved ? { label: resolved, path } : null;
      }

      const labelConfig = labelMap[segment];
      const label = labelConfig
        ? t(labelConfig.key, labelConfig.fallback)
        : segment.charAt(0).toUpperCase() + segment.slice(1);
      return { label, path };
    });
    return crumbs.flat().filter(Boolean);
  }, [pathname, t, labels]);
}
