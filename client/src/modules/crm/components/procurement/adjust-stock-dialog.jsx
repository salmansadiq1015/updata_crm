'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStockMutations } from '@/modules/crm/hooks/use-procurement-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

const ADJUSTMENT_TYPES = [
  { value: 'in', labelKey: 'adjustment.in' },
  { value: 'out', labelKey: 'adjustment.out' },
  { value: 'correction', labelKey: 'adjustment.correction' },
];

export function AdjustStockDialog({ open, onOpenChange, part }) {
  const { t } = useLanguage();
  const tx = (key) => t(`crm.procurement.${key}`);
  const [type, setType] = useState('correction');
  const [quantity, setQuantity] = useState('');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [reason, setReason] = useState('');

  const { adjust } = useStockMutations({
    onAdjust: () => {
      onOpenChange(false);
      setQuantity('');
      setDeliveryNoteNumber('');
      setReason('');
      setType('correction');
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!part || !quantity) return;
    adjust.mutate({
      id: part._id || part.id,
      data: { type, quantity: Number(quantity), deliveryNoteNumber, reason },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {tx('dialog.adjust.title')}
          </DialogTitle>
          {part && (
            <p className="text-sm text-muted-foreground">
              {part.name} - {tx('common.current')}: <strong>{part.currentStock ?? 0}</strong> {part.unit || 'Stk'}
            </p>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{tx('dialog.adjust.movementType')}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_TYPES.map((adjustmentType) => (
                  <SelectItem key={adjustmentType.value} value={adjustmentType.value}>
                    {tx(adjustmentType.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{tx('columns.qty')}</Label>
            <Input
              type="number"
              min="1"
              placeholder="0"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </div>

          {type !== 'correction' && (
            <div className="space-y-1.5">
              <Label>{tx('dialog.adjust.deliveryNote')}</Label>
              <Input
                placeholder={tx('dialog.adjust.deliveryNotePlaceholder')}
                value={deliveryNoteNumber}
                onChange={(event) => setDeliveryNoteNumber(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{tx('dialog.adjust.reason')}</Label>
            <Textarea
              placeholder={tx('dialog.adjust.reasonPlaceholder')}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tx('common.cancel')}
            </Button>
            <Button type="submit" disabled={adjust.isPending || !quantity}>
              {adjust.isPending ? tx('actions.saving') : tx('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
