'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

const labelMap = {
  dashboard: 'Dashboard',
  settings: 'Einstellungen',
  users: 'Benutzer',
  roles: 'Rollen',
  profile: 'Profil',
  crm: 'CRM',
  customers: 'Kunden',
  projects: 'Projekte',
  tasks: 'Aufgaben',
  scheduling: 'Einsatzplanung',
  accounting: 'Buchhaltung',
  catalog: 'Katalog',
  notifications: 'Benachrichtigungen',
};

export function useBreadcrumbs() {
  const pathname = usePathname();

  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const crumbs = segments.map((segment, index) => {
      const path = '/' + segments.slice(0, index + 1).join('/');
      const label = labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
      return { label, path };
    });
    return crumbs;
  }, [pathname]);
}
