'use client';
import { Suspense, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/shared/components/permission-gate';
import { useLanguage } from '@/lib/i18n/language-context';

/** Every Workflow Automation route: workflow:read gate + Suspense (pages read search params). */
export function AutomationRoute({ children, permission = 'workflow:read' }: { children: ReactNode; permission?: string }) {
  const { t } = useLanguage();
  return (
    <PermissionGate permission={permission} fallback={<p className="text-sm text-muted-foreground">{t('workflow.common.noAccess', "You don't have access to workflow automation.")}</p>}>
      <Suspense fallback={<div className="space-y-4"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>}>
        {children}
      </Suspense>
    </PermissionGate>
  );
}
