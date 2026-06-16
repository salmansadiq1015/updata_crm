'use client';

import { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePurchaseOrderMutations } from '@/modules/crm/hooks/use-procurement-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

export function GoodsReceiptDialog({ open, onOpenChange, order }) {
  const { t } = useLanguage();
  const tx = (key) => t(`crm.procurement.${key}`);
  const [notes, setNotes] = useState('');
  const [receivedQtys, setReceivedQtys] = useState({});

  const items = order?.items || [];

  const { receive } = usePurchaseOrderMutations({
    onReceive: () => {
      onOpenChange(false);
      setNotes('');
      setReceivedQtys({});
    },
  });

  const getRemaining = (item) => Math.max(0, Number(item?.quantity || 0) - Number(item?.receivedQuantity || 0));
  const getQty = (index) => receivedQtys[index] ?? getRemaining(items[index]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!order) return;
    const receiptItems = items.map((item, index) => ({
      ...item,
      itemId: item._id || item.id,
      receivedQuantity: Number(receivedQtys[index] ?? getRemaining(item)),
    }));
    receive.mutate({
      id: order._id || order.id,
      data: { items: receiptItems, notes: notes || undefined },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-emerald-500" />
            {tx('dialog.receipt.title')}
          </DialogTitle>
          {order?.orderNumber && (
            <p className="text-sm text-muted-foreground">
              {tx('common.order')} #{order.orderNumber}
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {items.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_100px] gap-0 px-3 py-2 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                <span>{tx('columns.article')}</span>
                <span>{tx('columns.received')}</span>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_100px] gap-3 px-3 py-2.5 border-b border-border/50 last:border-0 items-center">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.name || item.partNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx('filters.open')}: {getRemaining(item)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={getRemaining(item)}
                    value={getQty(index)}
                    onChange={(event) => setReceivedQtys((prev) => ({ ...prev, [index]: event.target.value }))}
                    className="h-8 text-sm text-center"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {tx('empty.noItemsInOrder')}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{tx('dialog.receipt.notes')}</Label>
            <Textarea
              placeholder={tx('dialog.receipt.notesPlaceholder')}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tx('common.cancel')}
            </Button>
            <Button type="submit" disabled={receive.isPending} className="gap-1.5">
              <PackageCheck className="h-4 w-4" />
              {receive.isPending ? tx('actions.recording') : tx('actions.confirmReceipt')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
