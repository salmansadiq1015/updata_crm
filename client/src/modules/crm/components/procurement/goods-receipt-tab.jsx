'use client';

import { useState } from 'react';
import { PackageCheck, Upload } from 'lucide-react';
import { usePurchaseOrders } from '@/modules/crm/hooks/use-procurement-queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/shared/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DeliveryNoteScanner } from './delivery-note-scanner';
import { GoodsReceiptDialog } from './goods-receipt-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const STATUS_CLS = {
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  sent: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
};

export function GoodsReceiptTab() {
  const { t } = useLanguage();
  const tx = (key, vars) => t(`crm.procurement.${key}`, null, vars);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState(null);

  const { data: result, isLoading } = usePurchaseOrders({ status: 'open', limit: 100 });
  const orders = (result?.data || []).filter((order) => ['sent', 'partial'].includes(order.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {tx('receipt.awaitingCount', { count: orders.length })}
        </p>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setScannerOpen(true)}>
          <Upload className="h-4 w-4" />
          {tx('actions.scanDeliveryNote')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border p-4 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={tx('empty.noPendingReceipts.title')}
          description={tx('empty.noPendingReceipts.description')}
        />
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const supplier = order.supplierId || {};
            const remaining = (order.items || []).reduce((sum, item) => {
              return sum + Math.max(0, Number(item.quantity || 0) - Number(item.receivedQuantity || 0));
            }, 0);
            return (
              <Card key={order._id || order.id} className="border-border">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm truncate">{order.orderNumber}</p>
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CLS[order.status] || STATUS_CLS.sent)}>
                        {tx(order.status === 'partial' ? 'status.partial' : 'status.sent')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[supplier.name || order.supplierName, `${remaining} ${tx('stock.openUnits')}`].filter(Boolean).join(' - ')}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(order.items || []).slice(0, 3).map((item) => item.name || item.partNumber).filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => setReceiveTarget(order)}
                    >
                      <PackageCheck className="h-3.5 w-3.5" />
                      {tx('actions.receive')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DeliveryNoteScanner open={scannerOpen} onOpenChange={setScannerOpen} />
      <GoodsReceiptDialog
        open={!!receiveTarget}
        onOpenChange={(value) => !value && setReceiveTarget(null)}
        order={receiveTarget}
      />
    </div>
  );
}
