'use client';

// Wizard step 1 — Location. The map lives beside this panel (owned by the
// workspace); here the user searches / draws / uploads a location and tunes the
// area shape + size.

import { CheckCircle2, MapPin } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { LocationSearch } from '../../components/location-search';
import { AreaSelector } from '../../components/area-selector';
import { useLeadGenWizard } from '../../state/lead-gen-store';
import { formatAreaSize } from '../geo-format';

export function LocationStep() {
  const { t, locale } = useLanguage();
  const { locationDraft, areaDraft } = useLeadGenWizard();
  const sizeLabel = formatAreaSize(areaDraft, locale);
  const locationLabel = locationDraft.formattedAddress ?? locationDraft.name;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('leadgen.step.location.title', 'Choose a location')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('leadgen.step.location.subtitle', 'Search for a place, draw an area, or upload a boundary.')}
        </p>
      </div>

      <LocationSearch />

      {locationLabel && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span className="min-w-0 truncate text-foreground">{locationLabel}</span>
        </div>
      )}

      <AreaSelector />

      {locationDraft.center && sizeLabel && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{t('leadgen.location.selected', 'Selected area')}: {sizeLabel}</span>
        </div>
      )}
    </div>
  );
}
