'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/lib/i18n/language-context';
import { useQuotationMutations } from '../hooks/use-qop-mutations';

function fmt(n) {
  return new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

export function ConvertToOrderDialog({ open, onClose, quotation }) {
  const { t } = useLanguage();
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
          <DialogTitle>{t('qop.convert.title', 'Auftrag erstellen')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2">
          <p className="text-sm text-muted-foreground">
            {t('qop.convert.desc', 'Wähle die Positionen aus, die in den Auftrag übernommen werden sollen.')}
          </p>

          <div className="rounded-lg border border-border overflow-hidden text-sm">
            <div className="grid grid-cols-[2rem_1fr_5rem_5rem] bg-muted/50 border-b text-xs font-medium text-muted-foreground">
              <div className="px-3 py-2" />
              <div className="px-3 py-2">{t('qop.convert.colDescription', 'Beschreibung')}</div>
              <div className="px-3 py-2 text-right">{t('qop.convert.colQty', 'Menge')}</div>
              <div className="px-3 py-2 text-right">{t('qop.convert.colTotal', 'Total')}</div>
            </div>
            {lineItems.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t('qop.convert.noItems', 'Keine Positionen vorhanden.')}
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
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'bg-primary border-primary' : 'border-border bg-background'}`}>
                      {isChecked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                  </div>
                  <div className="px-3 py-3">
                    <span>{li.description}</span>
                    {li.isOptional && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {t('qop.convert.optional', 'Optional')}
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
            {t('qop.convert.selected', '{count} / {total} Positionen ausgewählt')
              .replace('{count}', selected.size)
              .replace('{total}', lineItems.length)}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={convertQuotation.isPending}>
            {t('common.cancel', 'Abbrechen')}
          </Button>
          <Button
            onClick={handleConvert}
            disabled={selected.size === 0 || convertQuotation.isPending}
          >
            {convertQuotation.isPending
              ? t('qop.convert.converting', 'Konvertiere...')
              : t('qop.convert.confirm', 'Auftrag erstellen')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
