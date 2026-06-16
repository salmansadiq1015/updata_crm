'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useSuppliers } from '@/modules/crm/hooks/use-procurement-queries';
import { usePurchaseOrderMutations } from '@/modules/crm/hooks/use-procurement-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

const EMPTY_ITEM = () => ({ partNumber: '', name: '', quantity: 1, unitPrice: '', unit: 'Stk' });

function initialSupplierId(prefillPart) {
  return prefillPart?.supplierId?._id || prefillPart?.supplierId || '';
}

function initialItems(prefillPart) {
  if (!prefillPart) return [EMPTY_ITEM()];
  return [{
    partNumber: prefillPart.partNumber || '',
    name: prefillPart.name || '',
    quantity: Math.max(1, (prefillPart.minStockLevel ?? 1) - (prefillPart.currentStock ?? 0)),
    unitPrice: prefillPart.unitPrice || '',
    unit: prefillPart.unit || 'Stk',
    sparePartId: prefillPart._id || prefillPart.id,
  }];
}

export function PurchaseOrderDialog({ open, onOpenChange, prefillPart }) {
  const { t } = useLanguage();
  const tx = (key) => t(`crm.procurement.${key}`);

  const [supplierId, setSupplierId] = useState(() => initialSupplierId(prefillPart));
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(() => initialItems(prefillPart));

  const { data: suppliersResult } = useSuppliers({});
  const suppliers = suppliersResult?.data || [];

  const resetForm = () => {
    setSupplierId('');
    setExpectedDelivery('');
    setNotes('');
    setItems([EMPTY_ITEM()]);
  };

  const { create } = usePurchaseOrderMutations({
    onCreate: () => {
      onOpenChange(false);
      resetForm();
    },
  });

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);
  }, [items]);

  const updateItem = (index, field, value) => {
    setItems((prev) => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const addItem = () => setItems((prev) => [...prev, EMPTY_ITEM()]);
  const removeItem = (index) => setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));

  const handleSubmit = (event) => {
    event.preventDefault();
    create.mutate({
      supplierId: supplierId || undefined,
      expectedDelivery: expectedDelivery || undefined,
      notes: notes || undefined,
      currency: 'CHF',
      items: items.filter((item) => item.name || item.partNumber),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) resetForm(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tx('dialog.createPurchaseOrder.title')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{tx('columns.supplier')}</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder={tx('dialog.supplier.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier._id || supplier.id} value={supplier._id || supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{tx('dialog.expectedDelivery')}</Label>
              <Input
                type="date"
                value={expectedDelivery}
                onChange={(event) => setExpectedDelivery(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{tx('dialog.lineItems')}</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addItem}>
                <Plus className="h-3 w-3" />
                {tx('actions.addItem')}
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_80px_100px_40px] gap-0 px-3 py-2 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                <span>{tx('columns.name')}</span>
                <span>{tx('columns.partNumber')}</span>
                <span>{tx('columns.qty')}</span>
                <span>{tx('columns.unitPrice')}</span>
                <span />
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_80px_100px_40px] gap-2 p-2 border-b border-border/50 last:border-0 items-center">
                  <Input
                    placeholder={tx('columns.name')}
                    value={item.name}
                    onChange={(event) => updateItem(index, 'name', event.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder={tx('columns.partNumber')}
                    value={item.partNumber}
                    onChange={(event) => updateItem(index, 'partNumber', event.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={item.unitPrice}
                    onChange={(event) => updateItem(index, 'unitPrice', event.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {totalAmount > 0 && (
              <div className="flex justify-end">
                <span className="text-sm font-semibold">
                  {tx('common.total')}: {totalAmount.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{tx('dialog.notes')}</Label>
            <Textarea
              placeholder={tx('dialog.notes.placeholder')}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tx('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? tx('actions.creating') : tx('actions.createOrder')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
