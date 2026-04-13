'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/modules/dashboard/services/dashboard-service';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, FolderKanban, FileText, ClipboardList } from 'lucide-react';
import Link from 'next/link';

export function StatsGrid() {
  const { t } = useLanguage();
  const { data: stats, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: dashboardService.getStats,
    staleTime: 60_000,
  });

  const defaultCards = [
    { title: t('dashboard.stats.customers'), key: 'customers', icon: Users, href: '/crm', color: 'from-[#7B61FF] to-[#9F7AEA]' },
    { title: t('dashboard.stats.projects'), key: 'projects', icon: FolderKanban, href: '/projects', color: 'from-violet-500 to-purple-600' },
    { title: t('dashboard.stats.openQuotes'), key: 'openQuotes', icon: FileText, href: '/quotes', color: 'from-amber-500 to-orange-600' },
    { title: t('dashboard.stats.todayTasks'), key: 'todayTasks', icon: ClipboardList, href: '/tasks', color: 'from-emerald-500 to-green-600' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {defaultCards.map((card) => {
        const Icon = card.icon;
        const value = stats?.[card.key];

        return (
          <Card key={card.key} className="group shadow-theme-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center shadow-sm`}>
                <Icon className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold tracking-tight">
                  {value != null ? value.toLocaleString('de-CH') : '\u2014'}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
