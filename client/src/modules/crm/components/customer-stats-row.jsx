'use client';

import { PremiumStatCard } from '@/shared/components/premium-stat-card';
import { Users as UsersIcon, User, Building2, BellRing } from 'lucide-react';

export function CustomerStatsRow({ t, stats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <PremiumStatCard label={t('crm.stats.total', 'Total')} value={stats.total} icon={UsersIcon} accent="violet" />
      <PremiumStatCard label={t('crm.stats.private', 'Private')} value={stats.priv} icon={User} accent="blue" />
      <PremiumStatCard label={t('crm.stats.business', 'Business')} value={stats.biz} icon={Building2} accent="emerald" />
      <PremiumStatCard label={t('crm.stats.newsletter', 'Newsletter')} value={stats.news} icon={BellRing} accent="amber" />
    </div>
  );
}
