'use client';

// Area-type chooser (radius / circle / rectangle / polygon) + a radius slider
// for the radius mode. Writes `areaDraft` and `drawingMode` to the store; the
// workspace translates `drawingMode` into the map's own drawing prop.

import { useId } from 'react';
import { Circle, Hexagon, PenLine, Square, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { AreaType } from '../types/discovery-types';
import { useLeadGenWizard, useLeadGenMapSync } from '../state/lead-gen-store';
import {
  circleToAreaDraft,
  clampRadius,
  formatDistance,
  MAX_RADIUS_METERS,
  MIN_RADIUS_METERS,
  DEFAULT_RADIUS_METERS,
} from '../ui/map/map-geometry';
import { formatAreaSize, isLargeArea } from '../ui/geo-format';

const AREA_TYPES: Array<{ type: AreaType; icon: LucideIcon; labelKey: string; fallback: string }> = [
  { type: 'radius', icon: Target, labelKey: 'leadgen.area.radius', fallback: 'Radius' },
  { type: 'circle', icon: Circle, labelKey: 'leadgen.area.circle', fallback: 'Circle' },
  { type: 'rectangle', icon: Square, labelKey: 'leadgen.area.rectangle', fallback: 'Rectangle' },
  { type: 'polygon', icon: Hexagon, labelKey: 'leadgen.area.polygon', fallback: 'Polygon' },
];

export function AreaSelector() {
  const { t, locale } = useLanguage();
  const sliderId = useId();
  const { locationDraft, areaDraft, setAreaDraft } = useLeadGenWizard();
  const { setDrawingMode } = useLeadGenMapSync();

  const center = locationDraft.center;
  const radius = areaDraft.radiusMeters ?? DEFAULT_RADIUS_METERS;

  const chooseType = (type: AreaType) => {
    if (type === 'radius') {
      // A radius area is editable in place on the map; no free-draw session.
      setDrawingMode('none');
      if (center) {
        setAreaDraft(circleToAreaDraft(center, clampRadius(radius), 'radius'));
      } else {
        setAreaDraft({ type: 'radius', radiusMeters: clampRadius(radius), geometry: null, bounds: null });
      }
      return;
    }
    // Free-draw shapes: arm the matching drawing tool on the map.
    setAreaDraft({ type, geometry: null, bounds: null, radiusMeters: null });
    setDrawingMode(type);
  };

  const onRadiusChange = (meters: number) => {
    const clamped = clampRadius(meters);
    if (center) {
      setAreaDraft(circleToAreaDraft(center, clamped, 'radius'));
    } else {
      setAreaDraft({ type: 'radius', radiusMeters: clamped, geometry: null, bounds: null });
    }
  };

  const sizeLabel = formatAreaSize(areaDraft, locale);
  const large = isLargeArea(areaDraft);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t('leadgen.area.type', 'Area shape')}</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('leadgen.area.type', 'Area shape')}>
          {AREA_TYPES.map(({ type, icon: Icon, labelKey, fallback }) => {
            const active = areaDraft.type === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseType(type)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t(labelKey, fallback)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {areaDraft.type === 'radius' && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <label htmlFor={sliderId} className="text-xs font-medium text-muted-foreground">
              {t('leadgen.area.radiusLabel', 'Search radius')}
            </label>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatDistance(clampRadius(radius), locale)}
            </span>
          </div>
          <input
            id={sliderId}
            type="range"
            min={MIN_RADIUS_METERS}
            max={MAX_RADIUS_METERS}
            step={250}
            value={clampRadius(radius)}
            onChange={(event) => onRadiusChange(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            aria-valuetext={formatDistance(clampRadius(radius), locale)}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatDistance(MIN_RADIUS_METERS, locale)}</span>
            <span>{formatDistance(MAX_RADIUS_METERS, locale)}</span>
          </div>
        </div>
      )}

      {areaDraft.type && areaDraft.type !== 'radius' && !areaDraft.geometry && (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          {t('leadgen.location.draw.hint', 'Draw an area directly on the map.')}
        </p>
      )}

      {sizeLabel && (
        <div className="space-y-1.5 text-xs">
          <p className="text-muted-foreground">
            {t('leadgen.area.size', 'Area size: {value}', { value: sizeLabel })}
          </p>
          {large && (
            <p className="text-warning">
              {t(
                'leadgen.area.coverageNote',
                'The full area is searched in adaptive regions; any provider limitation is reported as partial.',
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
