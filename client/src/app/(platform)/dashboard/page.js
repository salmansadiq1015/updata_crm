'use client';

import { useAuth } from '@/shared/hooks/use-auth';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { StatsGrid } from '@/modules/dashboard/components/stats-grid';
import { RecentActivity } from '@/modules/dashboard/components/recent-activity';
import { SystemHealth } from '@/modules/dashboard/components/system-health';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Shield, Clock, ScrollText } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { t } = useLanguage();

  const quickActions = [
    { label: t('dashboard.manageUsers'), href: '/settings/users', icon: Users, permission: 'users:read' },
    { label: t('dashboard.manageRoles'), href: '/settings/roles', icon: Shield, permission: 'roles:read' },
    { label: t('dashboard.myProfile'), href: '/profile', icon: Clock },
    { label: t('dashboard.auditLog'), href: '/settings/audit', icon: ScrollText, permission: 'audit:read' },
  ];

  const visibleActions = quickActions.filter(
    (a) => !a.permission || hasPermission(a.permission)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t('dashboard.welcome')}, ${user?.firstName || 'Benutzer'}`}
        description={t('dashboard.subtitle')}
      />

      <StatsGrid />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <PermissionGate permission="audit:read">
            <RecentActivity />
          </PermissionGate>
        </div>

        <div className="space-y-6">
          <PermissionGate permission="settings:admin">
            <SystemHealth />
          </PermissionGate>

          <div>
            <h2 className="text-sm font-semibold mb-3">{t('dashboard.quickAccess')}</h2>
            <div className="grid gap-2">
              {visibleActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <Card className="hover:bg-muted/50 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <action.icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{action.label}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
