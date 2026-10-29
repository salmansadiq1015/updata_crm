'use client';

import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { AccessLogView } from '@/modules/governance/ui/access-log-view';
import { useLanguage } from '@/lib/i18n/language-context';

export default function AccessLogPage() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('governance.log.title', 'Access log')}
        description={t('governance.log.description', 'Who opened leads, conversations and calls they do not own (with the stated reason), revealed contact details or exported data.')}
      />
      <PermissionGate permission="audit:read" fallback={<p className="text-sm text-muted-foreground">{t('governance.noAccess', 'You do not have access to this page.')}</p>}>
        <AccessLogView />
      </PermissionGate>
    </div>
  );
}
