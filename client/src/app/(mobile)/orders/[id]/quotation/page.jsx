'use client';

import { useParams } from 'next/navigation';
import {
  Package,
  Wrench,
  FileText,
  Info,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useOrderQuotation } from '@/modules/mobile/hooks/use-order-queries';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { sanitizeHtml } from '@/modules/mobile/lib/sanitize';
import { cn } from '@/lib/utils';

export default function QuotationPage() {
  const { id: orderId } = useParams();
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';

  const { hasPermission } = usePermissions();
  const canViewPrices = hasPermission('quotation:view-prices');

  const { data: quotation, isLoading, isOffline } = useOrderQuotation(orderId);

  if (isLoading) return <QuotationSkeleton />;

  const items = quotation?.items || quotation?.line_items || [];
  const description = quotation?.description || quotation?.scope_description;

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={lang === 'de' ? 'Offerte' : 'Quotation'}
        showBack
      />

      {!quotation && !isLoading ? (
        <div className="px-4 py-8">
          <EmptyState
            variant={isOffline ? 'offline' : 'empty'}
            title={lang === 'de' ? 'Keine Offerte vorhanden' : 'No quotation available'}
            description={
              isOffline
                ? (lang === 'de' ? 'Offerte nur online verfügbar' : 'Quotation only available online')
                : (lang === 'de' ? 'Diesem Auftrag ist keine Offerte zugeordnet.' : 'No quotation assigned.')
            }
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Info banner — only show when prices are hidden */}
          {!canViewPrices && (
            <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                {lang === 'de'
                  ? 'Preise sind in der Technikeransicht nicht sichtbar. Nur Positionen und Mengen werden angezeigt.'
                  : 'Prices are not visible in technician view. Only items and quantities are shown.'}
              </p>
            </div>
          )}

          {/* Reference */}
          {(quotation?.reference || quotation?.quotation_number) && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                {lang === 'de' ? 'Referenz' : 'Reference'}
              </p>
              <p className="text-sm font-medium">{quotation.reference || quotation.quotation_number}</p>
              {quotation.valid_until && (
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === 'de' ? 'Gültig bis' : 'Valid until'}:{' '}
                  {new Date(quotation.valid_until).toLocaleDateString(lang === 'de' ? 'de-CH' : 'en-GB')}
                </p>
              )}
            </div>
          )}

          {/* Scope description */}
          {description && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {lang === 'de' ? 'Auftragsumfang' : 'Scope'}
              </p>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
              />
            </div>
          )}

          {/* Line items */}
          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {lang === 'de' ? 'Positionen' : 'Line Items'} ({items.length})
              </p>
              {items.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="bg-card border border-border rounded-xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted shrink-0">
                      {item.type === 'MATERIAL' ? (
                        <Package className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.description || item.name}</p>
                      {item.article_number && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Art.Nr: {item.article_number}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {item.quantity} {item.unit || 'Stk'}
                        </span>
                        {canViewPrices && item.unit_price != null && (
                          <span className="font-medium text-foreground">
                            CHF {Number(item.unit_price).toFixed(2)}
                          </span>
                        )}
                        {item.category && <span>{item.category}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      #{idx + 1}
                    </span>
                  </div>
                </div>
              ))}
              {canViewPrices && quotation?.total != null && (
                <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                  <span className="text-sm font-semibold">{lang === 'de' ? 'Total' : 'Total'}</span>
                  <span className="text-sm font-bold">CHF {Number(quotation.total).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {items.length === 0 && !description && (
            <EmptyState
              variant="empty"
              title={lang === 'de' ? 'Keine Details' : 'No details'}
            />
          )}
        </div>
      )}
    </div>
  );
}

function QuotationSkeleton() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="h-14 border-b border-border animate-pulse bg-muted/30" />
      <div className="px-4 py-4 space-y-3">
        <div className="h-16 bg-muted rounded-xl animate-pulse" />
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
        <div className="h-20 bg-muted rounded-xl animate-pulse" />
        <div className="h-20 bg-muted rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
