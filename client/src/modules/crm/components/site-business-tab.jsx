'use client';

import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/i18n/language-context';
import { searchService } from '@/modules/qop/services/search-service';
import { formatCurrency } from '@/lib/formatters/number';
import { formatDate } from '@/lib/formatters/date';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  QUOTATION_STATUS_LABELS, ORDER_STATUS_LABELS, INVOICE_STATUS_LABELS,
  QUOTATION_STATUS_COLORS, ORDER_STATUS_COLORS, INVOICE_STATUS_COLORS,
} from '@/modules/qop/constants/qop-constants';
import { FileText, ClipboardCheck, Receipt } from 'lucide-react';

const SECTIONS = [
  { type: 'quotation', titleKey: 'crm.sites.offerten', title: 'Offerten', icon: FileText, labels: QUOTATION_STATUS_LABELS, colors: QUOTATION_STATUS_COLORS },
  { type: 'order', titleKey: 'crm.sites.aufträge', title: 'Aufträge', icon: ClipboardCheck, labels: ORDER_STATUS_LABELS, colors: ORDER_STATUS_COLORS },
  { type: 'invoice', titleKey: 'crm.sites.rechnungen', title: 'Rechnungen', icon: Receipt, labels: INVOICE_STATUS_LABELS, colors: INVOICE_STATUS_COLORS },
];

/**
 * Offerten / Aufträge / Rechnungen linked to an object (site) — client feedback #11.
 * The object has no direct QOP link; documents reach it through its projects, which
 * the backend resolves when queried with `siteId`.
 */
export function SiteBusinessTab({ siteId }) {
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';

  const { data: docs = [], isLoading, error } = useQuery({
    queryKey: ['qop', 'documents', 'site', siteId],
    queryFn: () => searchService.search({ siteId, type: 'all', limit: 100, sortOrder: 'desc' }),
    select: (r) => r.data ?? [],
    enabled: !!siteId,
    staleTime: 20_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => {
        const items = docs.filter((d) => d.documentType === section.type);
        const Icon = section.icon;
        return (
          <div key={section.type} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <Icon className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">{t(section.titleKey, section.title)}</h3>
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {items.length}
              </span>
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t('crm.sites.noBusinessDocs', 'Keine Einträge')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((doc) => {
                  const label = section.labels?.[lang]?.[doc.status] || doc.status || '—';
                  const color = section.colors?.[doc.status] || 'bg-muted text-muted-foreground border-border';
                  return (
                    <li key={doc._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{doc.documentNumber}</span>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', color)}>{label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
                      <span className="w-28 text-right font-medium tabular-nums text-foreground">
                        {formatCurrency(doc.grandTotalRounded ?? doc.grandTotal ?? 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
