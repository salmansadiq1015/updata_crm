'use client';

import { AlertTriangle, Package, ShoppingCart, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProcurementStats } from '@/modules/crm/hooks/use-procurement-queries';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const CARDS = [
  {
    key: 'lowStockCount',
    icon: AlertTriangle,
    labelKey: 'kpi.lowStockCount',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500',
  },
  {
    key: 'openOrdersCount',
    icon: ShoppingCart,
    labelKey: 'kpi.openOrdersCount',
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    border: 'border-l-violet-500',
  },
  {
    key: 'totalArticles',
    icon: Package,
    labelKey: 'kpi.totalArticles',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-l-emerald-500',
  },
  {
    key: 'pendingReceiptsCount',
    icon: Truck,
    labelKey: 'kpi.pendingReceiptsCount',
    color: 'text-sky-500',
    bg: 'bg-sky-500/10',
    border: 'border-l-sky-500',
  },
];

const TAB_BY_KEY = {
  lowStockCount: 'reorders',
  openOrdersCount: 'orders',
  totalArticles: 'inventory',
  pendingReceiptsCount: 'receipt',
};

export function ProcurementKpiCards({ onTabChange }) {
  const { t } = useLanguage();
  const tx = (key) => t(`crm.procurement.${key}`);
  const { data: stats, isLoading } = useProcurementStats();

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const value = stats?.[card.key] ?? 0;
        return (
          <Card
            key={card.key}
            className={cn(
              'border-l-4 cursor-pointer transition-shadow hover:shadow-md',
              card.border,
            )}
            onClick={() => onTabChange?.(TAB_BY_KEY[card.key])}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', card.bg)}>
                <Icon className={cn('h-5 w-5', card.color)} />
              </div>
              <div className="min-w-0">
                {isLoading ? (
                  <>
                    <Skeleton className="h-6 w-8 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </>
                ) : (
                  <>
                    <p className={cn('text-2xl font-bold', card.color)}>{value}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {tx(card.labelKey)}
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
