'use client';

import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { CampaignPerformanceView } from '@/modules/campaignPerformance/ui/campaign-performance-view';
import { useLanguage } from '@/lib/i18n/language-context';

export default function CampaignPerformancePage() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('campaignPerformance.title', 'Campaign performance')}
        description={t('campaignPerformance.description', 'Spend, qualified leads, conversions, revenue and profit per campaign, channel and agent — from recorded costs and invoices only.')}
      />
      <PermissionGate permission="analytics:attribution:read" fallback={<p className="text-sm text-muted-foreground">{t('governance.noAccess', 'You do not have access to this page.')}</p>}>
        <CampaignPerformanceView />
      </PermissionGate>
    </div>
  );
}
