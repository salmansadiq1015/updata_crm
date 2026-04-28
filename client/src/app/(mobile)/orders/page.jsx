'use client';

import { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { OrderCard } from '@/modules/mobile/components/order-card';
import { OrderFilters } from '@/modules/mobile/components/order-filters';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { PullToRefresh } from '@/modules/mobile/components/pull-to-refresh';
import { useOrderList } from '@/modules/mobile/hooks/use-order-queries';
import { useSyncStatus } from '@/modules/mobile/hooks/use-sync-status';
import { triggerSync } from '@/modules/mobile/lib/sync-engine';
import { ORDER_STATUS } from '@/modules/mobile/constants/mobile-constants';

export default function OrdersPage() {
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState('today');
  const { isOnline } = useSyncStatus();

  const filters = buildFilters(activeFilter);
  const { data, isLoading, isError, isOffline, refetch } = useOrderList(filters);

  const orders = normalizeOrders(data);

  const handleRefresh = useCallback(() => {
    if (isOnline) {
      triggerSync();
      refetch();
    }
  }, [isOnline, refetch]);

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={t('mobile.orders.title', 'Meine Aufträge')}
        rightAction={
          isOnline && (
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg hover:bg-muted"
              aria-label="Aktualisieren"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          )
        }
      />

      <OrderFilters activeFilter={activeFilter} onFilterChange={setActiveFilter} />

      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <OrderListSkeleton />
        ) : isError ? (
          <EmptyState
            variant="error"
            title={t('mobile.orders.loadError', 'Laden fehlgeschlagen')}
            description={t('mobile.orders.loadErrorDesc', 'Aufträge konnten nicht geladen werden.')}
            action={
              <button
                onClick={() => refetch()}
                className="mt-3 text-sm text-primary underline underline-offset-2"
              >
                {t('mobile.common.retry', 'Erneut versuchen')}
              </button>
            }
          />
        ) : orders.length === 0 ? (
          <EmptyState
            variant={isOffline ? 'offline' : 'empty'}
            title={t('mobile.orders.empty', 'Keine Aufträge für heute')}
            description={
              isOffline
                ? t('mobile.common.offlineNote', 'Sie sind offline. Daten können veraltet sein.')
                : t('mobile.orders.emptyDesc', 'Neue Aufträge erscheinen hier automatisch.')
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </PullToRefresh>
    </div>
  );
}

function OrderListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-3 w-20 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded-full" />
          </div>
          <div className="h-4 w-3/4 bg-muted rounded mb-3" />
          <div className="flex gap-4">
            <div className="h-3 w-12 bg-muted rounded" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function buildFilters(activeFilter) {
  if (activeFilter === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      dateFrom: today.toISOString(),
      dateTo: tomorrow.toISOString(),
    };
  }

  if (Object.values(ORDER_STATUS).includes(activeFilter)) {
    return { status: activeFilter };
  }

  return {};
}

function normalizeOrders(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.data && Array.isArray(data.data)) return data.data;
  return [];
}
