'use client';

// Business detail drawer (DetailDrawer + ?detail=). Shows the full discovered
// business and only the actions its data actually supports — Call / Website /
// Directions / Share are omitted when the field is missing (never fabricated).
// "Add Lead" imports this single result (useImportResult).

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Compass,
  ExternalLink,
  Globe,
  Hash,
  Loader2,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Share2,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { DetailDrawer } from '@/shared/components/detail-drawer';
import { Button } from '@/components/ui/button';
import { useDiscoveryResult, useImportResult } from '../hooks/use-discovery';
import {
  CrmStatusBadge,
  InfoRow,
  ImportedBadge,
  getPriceLevelLabel,
  isImported,
  resultMapsUrl,
  toSafeWebUrl,
  toTelHref,
  websiteLabel,
} from './result-ui';

const linkClass =
  'rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 py-1">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{title}</h3>
        <div className="h-px flex-1 bg-border/50" />
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function InfoList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <dl aria-label={label} className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-background/40">
      {children}
    </dl>
  );
}

export type BusinessDetailDrawerProps = {
  sessionId: string | null;
  resultId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
};

export function BusinessDetailDrawer({
  sessionId,
  resultId,
  open,
  onOpenChange,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: BusinessDetailDrawerProps) {
  const { t, locale } = useLanguage();
  const resultQuery = useDiscoveryResult(open ? sessionId : null, open ? resultId : null);
  const importResult = useImportResult(sessionId ?? '');
  const result = resultQuery.data;
  const business = result?.business;

  const title = business?.name ?? (resultQuery.isError ? t('leadgen.error.generic.title', 'Not found') : t('leadgen.detail.title', 'Loading…'));
  const subtitle = business ? (business.type ?? business.primaryType ?? undefined) : undefined;

  const callHref = toTelHref(business?.phone ?? business?.internationalPhone ?? null);
  const webHref = toSafeWebUrl(business?.website ?? null);
  const mapsHref = business ? resultMapsUrl(business.mapsUrl, business.location, result?.placeId ?? null) : null;
  const priceLabel = getPriceLevelLabel(t, business?.priceLevel ?? null);
  const imported = result ? isImported(result.importStatus) : false;

  const handleShare = async () => {
    const url = mapsHref ?? webHref ?? '';
    if (!url || typeof navigator === 'undefined') return;
    try {
      if (navigator.share) {
        await navigator.share({ title: business?.name ?? '', url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user dismissed / unsupported — ignore */
    }
  };

  const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  let body: ReactNode;
  if (!result && resultQuery.isError) {
    body = (
      <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">{t('leadgen.error.generic.body', 'This business could not be loaded.')}</p>
        <Button variant="outline" size="sm" onClick={() => void resultQuery.refetch()}>
          {t('leadgen.error.retry', 'Retry')}
        </Button>
      </div>
    );
  } else if (!result || !business) {
    body = (
      <div className="space-y-4" aria-busy="true">
        <div className="skeleton-shimmer h-6 w-1/2 rounded bg-muted" />
        <div className="skeleton-shimmer h-24 rounded-xl bg-muted" />
        <div className="skeleton-shimmer h-24 rounded-xl bg-muted" />
      </div>
    );
  } else {
    const quickActions: Array<{ key: string; label: string; icon: typeof Phone; href: string; external: boolean }> = [];
    if (callHref) quickActions.push({ key: 'call', label: t('leadgen.action.call', 'Call'), icon: Phone, href: callHref, external: false });
    if (webHref) quickActions.push({ key: 'web', label: t('leadgen.action.website', 'Website'), icon: Globe, href: webHref, external: true });
    if (mapsHref) quickActions.push({ key: 'dir', label: t('leadgen.action.directions', 'Directions'), icon: Navigation, href: mapsHref, external: true });

    body = (
      <div className="space-y-5">
        {/* Status row */}
        <div className="flex flex-wrap items-center gap-2">
          <CrmStatusBadge status={result.crmStatus} t={t} size="md" />
          {imported && <ImportedBadge t={t} />}
          {business.rating != null && (
            <span className="inline-flex items-center gap-1 text-sm">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="font-medium text-foreground">{business.rating.toFixed(1)}</span>
              {business.reviewCount != null && (
                <span className="text-xs text-muted-foreground">
                  {t('leadgen.detail.reviews', '{count} reviews', { count: business.reviewCount })}
                </span>
              )}
            </span>
          )}
          {priceLabel && <span className="text-sm text-muted-foreground">· {priceLabel}</span>}
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button key={action.key} asChild variant="outline" size="sm" className="gap-1.5">
              <a href={action.href} {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                <action.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {action.label}
              </a>
            </Button>
          ))}
          {(mapsHref || webHref) && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('leadgen.action.share', 'Share')}
            </Button>
          )}
        </div>

        {/* Contact */}
        <Section title={t('leadgen.detail.title', 'Business')}>
          <InfoList label={t('leadgen.detail.title', 'Business')}>
            {business.address.formatted && (
              <InfoRow icon={MapPin} label={t('leadgen.detail.address', 'Address')}>
                {business.address.formatted}
              </InfoRow>
            )}
            <InfoRow icon={Phone} label={t('leadgen.detail.phone', 'Phone')}>
              {business.phone ? (
                callHref ? <a href={callHref} className={linkClass}>{business.phone}</a> : business.phone
              ) : (
                <span className="text-muted-foreground/70">{t('leadgen.detail.noPhone', 'No phone')}</span>
              )}
            </InfoRow>
            <InfoRow icon={Mail} label={t('leadgen.detail.email', 'Email')}>
              {business.email ? (
                <a href={`mailto:${business.email}`} className={linkClass}>{business.email}</a>
              ) : (
                <span className="text-muted-foreground/70">{t('leadgen.detail.noEmail', 'No email')}</span>
              )}
            </InfoRow>
            <InfoRow icon={Globe} label={t('leadgen.detail.website', 'Website')}>
              {webHref ? (
                <a href={webHref} target="_blank" rel="noopener noreferrer" className={cn(linkClass, 'inline-flex items-center gap-1')}>
                  {websiteLabel(business.website, business.websiteDomain)}
                  <ExternalLink className="h-3 w-3 opacity-70" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-muted-foreground/70">{t('leadgen.detail.noWebsite', 'No website')}</span>
              )}
            </InfoRow>
            {(business.type || business.primaryType) && (
              <InfoRow icon={Building2} label={t('leadgen.detail.category', 'Category')}>
                {business.type ?? business.primaryType}
              </InfoRow>
            )}
            {business.location && (
              <InfoRow icon={Compass} label={t('leadgen.detail.coordinates', 'Coordinates')}>
                <span className="font-mono text-xs">
                  {business.location.lat.toFixed(5)}, {business.location.lng.toFixed(5)}
                </span>
              </InfoRow>
            )}
          </InfoList>
        </Section>

        {/* Discovery provenance */}
        <Section title={t('leadgen.detail.discovery', 'Discovery')}>
          <InfoList label={t('leadgen.detail.discovery', 'Discovery')}>
            <InfoRow icon={CheckCircle2} label={t('leadgen.detail.status', 'CRM status')}>
              <CrmStatusBadge status={result.crmStatus} t={t} />
            </InfoRow>
            {formatDateTime(result.discoveredAt) && (
              <InfoRow icon={CalendarClock} label={t('leadgen.detail.discovered', 'Discovered')}>
                {formatDateTime(result.discoveredAt)}
              </InfoRow>
            )}
            {result.placeId && (
              <InfoRow icon={Hash} label="Place ID">
                <code className="break-all font-mono text-xs text-muted-foreground">{result.placeId}</code>
              </InfoRow>
            )}
          </InfoList>
        </Section>
      </div>
    );
  }

  const footer = result ? (
    imported ? (
      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={result.importedLeadId ? `/leads?detail=${result.importedLeadId}` : '/leads'}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leadgen.action.viewLead', 'View lead')}
          </Link>
        </Button>
      </div>
    ) : (
      <div className="flex items-center justify-end gap-2">
        {mapsHref && (
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <a href={mapsHref} target="_blank" rel="noopener noreferrer">
              <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
              {t('leadgen.action.openInMaps', 'Open in Maps')}
            </a>
          </Button>
        )}
        <Button
          size="sm"
          className="gap-1.5"
          disabled={importResult.isPending || !sessionId}
          onClick={() => resultId && importResult.mutate({ resultId })}
        >
          {importResult.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {t('leadgen.action.addLead', 'Add lead')}
        </Button>
      </div>
    )
  ) : null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={subtitle}
      enableEditMode={false}
      size="lg"
      onPrevious={onPrevious}
      onNext={onNext}
      hasPrevious={hasPrevious}
      hasNext={hasNext}
      footer={footer}
    >
      {body}
    </DetailDrawer>
  );
}
