'use client';

import { Skeleton as BoneSkeleton } from 'boneyard-js/react';
import {
  useDashboardSummary,
  useDashboardUtilization,
  useDashboardAlerts,
  useDashboardUnassignedOrders,
} from '../../hooks/use-dashboard-queries';
import { DashboardSummaryCards } from './dashboard-summary-cards';
import { DashboardUpcomingChart } from './dashboard-upcoming-chart';
import { DashboardUtilization } from './dashboard-utilization';
import { DashboardAlertsList } from './dashboard-alerts-list';
import { DashboardUnassignedOrders } from './dashboard-unassigned-orders';
import { useLanguage } from '@/lib/i18n/language-context';

export function DeployDashboard() {
  const { t } = useLanguage();
  const { data: summary, isLoading: loadingSummary } = useDashboardSummary();
  const { data: utilization, isLoading: loadingUtil } = useDashboardUtilization();
  const { data: alerts, isLoading: loadingAlerts } = useDashboardAlerts();
  const { data: unassignedOrders, isLoading: loadingUnassigned } = useDashboardUnassignedOrders();

  const isLoading = loadingSummary && loadingUtil && loadingAlerts && loadingUnassigned;

  return (
    <BoneSkeleton name="deploy-dashboard" loading={isLoading}>
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">
          {t('deploy.dashboard.title', 'Einsatzplanung – Übersicht')}
        </h1>

        <DashboardSummaryCards summary={summary} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashboardUpcomingChart upcoming7Days={summary?.upcoming7Days} />
          <DashboardUtilization data={utilization} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashboardUnassignedOrders data={unassignedOrders} isLoading={loadingUnassigned} />
          <DashboardAlertsList data={alerts} />
        </div>
      </div>
    </BoneSkeleton>
  );
}
