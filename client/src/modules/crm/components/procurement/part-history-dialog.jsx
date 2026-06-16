'use client';

import { format } from 'date-fns';
import { History, PackageCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { usePartMovements } from '@/modules/crm/hooks/use-procurement-queries';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const TYPE_CLASS = {
  receipt: 'text-emerald-500',
  in: 'text-emerald-500',
  out: 'text-red-500',
  issue: 'text-red-500',
  correction: 'text-amber-500',
  adjustment: 'text-amber-500',
};

function getMovementLabelKey(type) {
  if (type === 'receipt') return 'movement.goodsReceipt';
  if (type === 'out' || type === 'issue') return 'movement.goodsIssue';
  return 'movement.stockCorrection';
}

export function PartHistoryDialog({ open, onOpenChange, part }) {
  const { t } = useLanguage();
  const tx = (key) => t(`crm.procurement.${key}`);
  const partId = part?._id || part?.id;
  const { data: result, isLoading } = usePartMovements(open ? partId : null);
  const movements = result?.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-violet-500" />
            {tx('dialog.history.title')}
          </DialogTitle>
          {part && (
            <p className="text-sm text-muted-foreground">
              {part.name} {part.partNumber ? `- ${part.partNumber}` : ''}
            </p>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-border p-3 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            ))}
          </div>
        ) : movements.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title={tx('empty.noHistory.title')}
            description={tx('empty.noHistory.description')}
          />
        ) : (
          <div className="space-y-2">
            {movements.map((movement) => {
              const supplier = movement.supplierId?.name;
              const orderNumber = movement.purchaseOrderId?.orderNumber;
              const reference = orderNumber || movement.deliveryNoteNumber || movement.referenceNumber || movement.reason;
              return (
                <div key={movement._id || movement.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn('text-sm font-semibold', TYPE_CLASS[movement.type] || 'text-foreground')}>
                        {tx(getMovementLabelKey(movement.type))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {movement.createdAt ? format(new Date(movement.createdAt), 'dd.MM.yyyy HH:mm') : '-'}
                      </p>
                    </div>
                    <span className={cn('text-sm font-bold', Number(movement.quantity) >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                      {Number(movement.quantity) >= 0 ? '+' : ''}{movement.quantity}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>{tx('columns.stockAfter')}: {movement.stockAfter}</span>
                    {supplier && <span>{tx('columns.supplier')}: {supplier}</span>}
                    {reference && <span className="sm:col-span-2">{tx('columns.reference')}: {reference}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
