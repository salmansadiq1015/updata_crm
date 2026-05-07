'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/lib/i18n/language-context';
import { useQuotationMutations } from '../hooks/use-qop-mutations';

function fmt(n) {
  return new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

export function ConvertToOrderDialog({ open, onClose, quotation }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { convertQuotation } = useQuotationMutations();

  const lineItems = (quotation?.lineItems ?? []).filter((li) => li.type !== 'text' && li.type !== 'subtotal');
  const [selected, setSelected] = useState(() => new Set(lineItems.map((li) => String(li._id))));

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleConvert = () => {
    const allSelected = selected.size === lineItems.length;
    convertQuotation.mutate({
      id: quotation._id ?? quotation.id,
      selectedLineItemIds: allSelected ? undefined : [...selected],
    }, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{de ? 'Auftrag erstellen' : 'Convert to Order'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2">
          <p className="text-sm text-muted-foreground">
            {de
              ? 'Wähle die Positionen aus, die in den Auftrag übernommen werden sollen.'
              : 'Select which line items to include in the order.'}
          </p>

          <div className="rounded-lg border border-border overflow-hidden text-sm">
            <div className="grid grid-cols-[2rem_1fr_5rem_5rem] bg-muted/50 border-b text-xs font-medium text-muted-foreground">
              <div className="px-3 py-2" />
              <div className="px-3 py-2">{de ? 'Beschreibung' : 'Description'}</div>
              <div className="px-3 py-2 text-right">{de ? 'Menge' : 'Qty'}</div>
              <div className="px-3 py-2 text-right">{de ? 'Total' : 'Total'}</div>
            </div>
            {lineItems.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {de ? 'Keine Positionen vorhanden.' : 'No line items.'}
              </div>
            )}
            {lineItems.map((li) => {
              const id = String(li._id);
              const isChecked = selected.has(id);
              return (
                <div
                  key={id}
                  className={`grid grid-cols-[2rem_1fr_5rem_5rem] border-b last:border-0 cursor-pointer hover:bg-muted/20 transition-colors ${isChecked ? '' : 'opacity-50'}`}
                  onClick={() => toggle(id)}
                >
                  <div className="px-3 py-3 flex items-center">
                    <Checkbox checked={isChecked} onCheckedChange={() => toggle(id)} onClick={(e) => e.stopPropagation()} />
                  </div>
                  <div className="px-3 py-3">
                    <span>{li.description}</span>
                    {li.isOptional && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {de ? 'Optional' : 'Optional'}
                      </Badge>
                    )}
                  </div>
                  <div className="px-3 py-3 text-right text-muted-foreground">{li.quantity} {li.unit}</div>
                  <div className="px-3 py-3 text-right font-medium">{fmt(li.lineTotal)}</div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            {selected.size} / {lineItems.length} {de ? 'Positionen ausgewählt' : 'items selected'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={convertQuotation.isPending}>
            {de ? 'Abbrechen' : 'Cancel'}
          </Button>
          <Button
            onClick={handleConvert}
            disabled={selected.size === 0 || convertQuotation.isPending}
          >
            {convertQuotation.isPending
              ? (de ? 'Konvertiere...' : 'Converting...')
              : (de ? 'Auftrag erstellen' : 'Create Order')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
