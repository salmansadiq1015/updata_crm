'use client';

// Wizard step 3 — Review. A plain-language summary of what will be searched; the
// "Start Analysis" action lives in the workspace footer. Surfaces an honest
// coverage note for large areas.

import { useMemo } from 'react';
import { Building2, MapPin, Ruler, Search, Tag } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useBusinessTypes } from '../../hooks/use-discovery';
import { useLeadGenWizard } from '../../state/lead-gen-store';
import { formatAreaSize, isLargeArea } from '../geo-format';

function Row({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function ReviewStep() {
  const { t, locale } = useLanguage();
  const { locationDraft, areaDraft, selectedBusinessTypes, keyword } = useLeadGenWizard();
  const typesQuery = useBusinessTypes();

  const byId = useMemo(() => new Map((typesQuery.data ?? []).map((type) => [type.id, type])), [typesQuery.data]);
  const typeLabels = selectedBusinessTypes.map((id) => {
    const type = byId.get(id);
    return type ? (type.i18nKey ? t(type.i18nKey, type.name) : type.name) : id;
  });

  const sizeLabel = formatAreaSize(areaDraft, locale);
  const areaTypeLabel = areaDraft.type ? t(`leadgen.area.${areaDraft.type}`, areaDraft.type) : '—';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('leadgen.step.review.title', 'Review your search')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('leadgen.step.review.subtitle', 'Confirm the area and categories before starting.')}
        </p>
      </div>

      <dl className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border bg-card">
        <Row icon={MapPin} label={t('leadgen.step.location.title', 'Location')}>
          {locationDraft.formattedAddress ?? locationDraft.name ?? t('leadgen.location.selected', 'Selected area')}
        </Row>
        <Row icon={Ruler} label={t('leadgen.area.type', 'Area')}>
          <span>{areaTypeLabel}</span>
          {sizeLabel && <span className="text-muted-foreground"> · {sizeLabel}</span>}
        </Row>
        <Row icon={Building2} label={t('leadgen.businessType.title', 'Business types')}>
          {typeLabels.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {typeLabels.map((label, index) => (
                <li
                  key={`${label}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                >
                  <Tag className="h-3 w-3" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Row>
        {keyword.trim() && (
          <Row icon={Search} label={t('leadgen.businessType.keyword', 'Keyword')}>
            {keyword}
          </Row>
        )}
      </dl>

      {isLargeArea(areaDraft) && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-warning">
          {t(
            'leadgen.area.coverageNote',
            'The full area is searched in adaptive regions; any provider limitation is reported as partial.',
          )}
        </p>
      )}
    </div>
  );
}
