'use client';

import { Map as MapIcon, Satellite } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { DiscoveryDrawingMode, DiscoveryMapTypeId } from './types';
import {
  MAX_RADIUS_METERS,
  MIN_RADIUS_METERS,
  clampRadius,
  formatDistance,
} from './map-geometry';

interface MapTypeToggleProps {
  value: DiscoveryMapTypeId;
  onChange: (value: DiscoveryMapTypeId) => void;
}

/** Segmented Map / Satellite control. Active segment uses the primary token. */
export function MapTypeToggle({ value, onChange }: MapTypeToggleProps) {
  const { t } = useLanguage();
  const options: Array<{ id: DiscoveryMapTypeId; label: string; Icon: typeof MapIcon }> = [
    { id: 'roadmap', label: t('leadgen.map.roadmap', 'Map'), Icon: MapIcon },
    { id: 'satellite', label: t('leadgen.map.satellite', 'Satellite'), Icon: Satellite },
  ];
  return (
    <div
      role="group"
      aria-label={t('leadgen.map.mapType', 'Map type')}
      className="pointer-events-auto absolute top-3 end-3 z-10 flex gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-theme-md backdrop-blur"
    >
      {options.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-theme-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface RadiusSliderProps {
  radiusMeters: number;
  onChange: (meters: number) => void;
}

/** Radius control for 'radius' drawing mode (map UI mockup §5). */
export function RadiusSlider({ radiusMeters, onChange }: RadiusSliderProps) {
  const { t, language } = useLanguage();
  const value = clampRadius(radiusMeters);
  return (
    <div className="pointer-events-auto absolute bottom-3 start-3 z-10 w-56 max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-card/95 p-3 shadow-theme-md backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor="discovery-radius" className="text-xs font-medium text-muted-foreground">
          {t('leadgen.map.radius', 'Radius')}
        </label>
        <span className="text-xs font-semibold text-primary">
          {formatDistance(value, language)}
        </span>
      </div>
      <input
        id="discovery-radius"
        type="range"
        min={MIN_RADIUS_METERS}
        max={MAX_RADIUS_METERS}
        step={250}
        value={value}
        onChange={(e) => onChange(clampRadius(Number(e.target.value)))}
        aria-label={t('leadgen.map.radius', 'Radius')}
        aria-valuetext={formatDistance(value, language)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </div>
  );
}

interface DrawingHintProps {
  drawingMode: DiscoveryDrawingMode;
}

/** Small instructional hint while a free-draw mode is active. */
export function DrawingHint({ drawingMode }: DrawingHintProps) {
  const { t } = useLanguage();
  if (drawingMode !== 'circle' && drawingMode !== 'rectangle' && drawingMode !== 'polygon') {
    return null;
  }
  const hint =
    drawingMode === 'polygon'
      ? t('leadgen.map.hintPolygon', 'Click to add points, double-click to finish')
      : t('leadgen.map.hintDrag', 'Click and drag on the map to draw the area');
  return (
    <div className="pointer-events-none absolute top-3 start-3 z-10 max-w-[70%] rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-theme-sm backdrop-blur">
      {hint}
    </div>
  );
}
