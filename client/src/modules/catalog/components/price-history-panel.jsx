'use client';

import { ArrowRight } from 'lucide-react';
import { usePriceHistory } from '../hooks/use-price-queries';
import { useLanguage } from '@/lib/i18n/language-context';

function fmtDate(val) {
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('de-CH');
}

export function PriceHistoryPanel({ articleId }) {
  const { t } = useLanguage();
  const { data: history = [], isLoading } = usePriceHistory(articleId);

  if (!articleId) return null;
  if (isLoading) return <div className="p-4 text-sm text-muted-foreground animate-pulse">Loading...</div>;
  if (history.length === 0) return <div className="p-4 text-sm text-muted-foreground">No price history.</div>;

  return (
    <div className="space-y-2 p-4">
      <p className="text-sm font-medium">{t('catalog.prices.history')}</p>
      <div className="space-y-1.5">
        {history.map((entry) => (
          <div key={entry._id ?? entry.id} className="flex items-center gap-3 text-xs rounded-md border px-3 py-2">
            <span className="text-muted-foreground font-mono">{Number(entry.oldPrice).toFixed(2)}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="font-medium font-mono">{Number(entry.newPrice).toFixed(2)}</span>
            <span className="ml-auto text-muted-foreground">{fmtDate(entry.effectiveDate)}</span>
            {entry.createdBy && (
              <span className="text-muted-foreground">
                {entry.createdBy.firstName} {entry.createdBy.lastName}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
