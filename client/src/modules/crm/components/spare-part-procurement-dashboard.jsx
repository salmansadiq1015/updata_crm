'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, PackageCheck, ShoppingCart } from 'lucide-react';
import { sparePartService } from '@/modules/crm/services/spare-part-service';
import { useSparePartMutations } from '@/modules/crm/hooks/use-spare-part-mutations';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { PageHeader } from '@/shared/components/page-header';
import { EmptyState } from '@/shared/components/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'open', de: 'Offen', en: 'Open' },
  { value: 'requested', de: 'Angefragt', en: 'Requested' },
  { value: 'ordered', de: 'Bestellt', en: 'Ordered' },
  { value: 'received', de: 'Erhalten', en: 'Received' },
  { value: 'cancelled', de: 'Storniert', en: 'Cancelled' },
  { value: 'all', de: 'Alle', en: 'All' },
];

const URGENCY_META = {
  urgent: { labelDe: 'Dringend', labelEn: 'Urgent', className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  high: { labelDe: 'Hoch', labelEn: 'High', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  normal: { labelDe: 'Normal', labelEn: 'Normal', className: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  low: { labelDe: 'Niedrig', labelEn: 'Low', className: 'bg-muted text-muted-foreground' },
};

const STATUS_META = {
  requested: { labelDe: 'Angefragt', labelEn: 'Requested', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  ordered: { labelDe: 'Bestellt', labelEn: 'Ordered', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  received: { labelDe: 'Erhalten', labelEn: 'Received', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  cancelled: { labelDe: 'Storniert', labelEn: 'Cancelled', className: 'bg-muted text-muted-foreground' },
};

export function SparePartProcurementDashboard() {
  const { locale, t } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const [status, setStatus] = useState('open');

  const filters = useMemo(() => ({ status, limit: 100 }), [status]);
  const { data: result, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.spareParts.orderRequests(filters),
    queryFn: () => sparePartService.listOrderRequests(filters),
    staleTime: 30_000,
  });

  const { updateOrderStatus } = useSparePartMutations();
  const items = result?.data || [];
  const openCount = items.filter((item) => ['requested', 'ordered'].includes(item.orderStatus)).length;

  const updateStatus = (item, nextStatus) => {
    updateOrderStatus.mutate({
      installationId: idOf(item.installationId),
      sparePartId: idOf(item.sparePartId),
      data: {
        status: nextStatus,
        receivedQuantity: nextStatus === 'received' ? item.orderQuantity || 1 : undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('crm.procurement.title', 'Spare-part procurement')}
        description={t('crm.procurement.description', 'Review field order requests and update fulfillment status.')}
      />

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{lang === 'de' ? 'Offene Anfragen' : 'Open requests'}</p>
                <p className="text-2xl font-bold">{openCount}</p>
              </div>
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {lang === 'de' ? option.de : option.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            {isLoading && <ProcurementSkeleton />}
            {isError && (
              <EmptyState
                icon={AlertTriangle}
                title={lang === 'de' ? 'Anfragen konnten nicht geladen werden' : 'Could not load requests'}
                description={lang === 'de' ? 'Bitte erneut versuchen.' : 'Please try again.'}
              />
            )}
            {!isLoading && !isError && items.length === 0 && (
              <EmptyState
                icon={CheckCircle2}
                title={lang === 'de' ? 'Keine Bestellanfragen' : 'No order requests'}
                description={lang === 'de' ? 'Neue Markierungen aus dem Feld erscheinen hier.' : 'New field requests will appear here.'}
              />
            )}
            {!isLoading && !isError && items.length > 0 && (
              <div className="space-y-2">
                {items.map((item) => (
                  <ProcurementRow
                    key={item._id || item.id}
                    item={item}
                    lang={lang}
                    pending={updateOrderStatus.isPending}
                    onStatus={updateStatus}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProcurementRow({ item, lang, pending, onStatus }) {
  const part = item.sparePartId || {};
  const installation = item.installationId || {};
  const site = installation.siteId || {};
  const customer = site.customerId || {};
  const status = STATUS_META[item.orderStatus] || STATUS_META.requested;
  const urgency = URGENCY_META[item.orderUrgency] || URGENCY_META.normal;
  const terminal = ['received', 'cancelled'].includes(item.orderStatus);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{part.name || part.partNumber}</p>
            <Badge className={urgency.className}>{lang === 'de' ? urgency.labelDe : urgency.labelEn}</Badge>
            <Badge className={status.className}>{lang === 'de' ? status.labelDe : status.labelEn}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {[part.partNumber, part.manufacturer, `Qty ${item.orderQuantity || 1}`].filter(Boolean).join(' | ')}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[customer.name, site.name, installation.installationNumber].filter(Boolean).join(' / ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {installation._id && (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
              <Link href={`/crm/installations/${installation._id}`}>
                <ExternalLink className="h-3.5 w-3.5" />
                {lang === 'de' ? 'Anlage' : 'Installation'}
              </Link>
            </Button>
          )}
          {item.orderStatus === 'requested' && (
            <Button variant="outline" size="sm" className="h-8" disabled={pending} onClick={() => onStatus(item, 'ordered')}>
              {lang === 'de' ? 'Als bestellt markieren' : 'Mark ordered'}
            </Button>
          )}
          {!terminal && (
            <Button size="sm" className="h-8 gap-1.5" disabled={pending} onClick={() => onStatus(item, 'received')}>
              <PackageCheck className="h-3.5 w-3.5" />
              {lang === 'de' ? 'Erhalten' : 'Receive'}
            </Button>
          )}
          {!terminal && (
            <Button variant="ghost" size="sm" className="h-8" disabled={pending} onClick={() => onStatus(item, 'cancelled')}>
              {lang === 'de' ? 'Stornieren' : 'Cancel'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ className, children }) {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', className)}>
      {children}
    </span>
  );
}

function ProcurementSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border p-4">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="mt-2 h-3 w-80" />
        </div>
      ))}
    </div>
  );
}

function idOf(value) {
  return value?._id || value?.id || value;
}
