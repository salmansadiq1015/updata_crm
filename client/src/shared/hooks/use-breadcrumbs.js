'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';

const labelMap = {
  dashboard: { key: 'sidebar.dashboard', fallback: 'Dashboard' },
  settings: { key: 'sidebar.settings', fallback: 'Settings' },
  users: { key: 'sidebar.users', fallback: 'Users' },
  roles: { key: 'sidebar.roles', fallback: 'Roles' },
  profile: { key: 'userMenu.profile', fallback: 'Profile' },
  crm: { key: 'sidebar.crm', fallback: 'CRM' },
  customers: { key: 'sidebar.customers', fallback: 'Customers' },
  'asset-maintenance': { key: 'sidebar.assetMaintenance', fallback: 'Systems & Maintenance' },
  projects: { key: 'sidebar.projects', fallback: 'Projects' },
  tasks: { key: 'sidebar.tasks', fallback: 'Tasks' },
  scheduling: { key: 'sidebar.scheduling', fallback: 'Scheduling' },
  accounting: { key: 'sidebar.accounting', fallback: 'Accounting' },
  catalog: { key: 'sidebar.catalog', fallback: 'Catalog' },
  notifications: { key: 'sidebar.notifications', fallback: 'Notifications' },
};

export function useBreadcrumbs() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const crumbs = segments.map((segment, index) => {
      const path = '/' + segments.slice(0, index + 1).join('/');
      const labelConfig = labelMap[segment];
      const label = labelConfig
        ? t(labelConfig.key, labelConfig.fallback)
        : segment.charAt(0).toUpperCase() + segment.slice(1);
      return { label, path };
    });
    return crumbs;
  }, [pathname, t]);
}
