'use client';

import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { TeamAdmin } from '@/modules/governance/ui/team-admin';
import { useLanguage } from '@/lib/i18n/language-context';

export default function TeamsPage() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('governance.teams.title', 'Teams')}
        description={t('governance.teams.description', 'Group users into teams. Supervisors and managers see the leads assigned to their team members.')}
      />
      <PermissionGate permission="team:read" fallback={<p className="text-sm text-muted-foreground">{t('governance.noAccess', 'You do not have access to this page.')}</p>}>
        <TeamAdmin />
      </PermissionGate>
    </div>
  );
}
