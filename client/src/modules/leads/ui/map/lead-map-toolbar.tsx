'use client';

import {
  Circle,
  Eraser,
  Hexagon,
  Maximize,
  Maximize2,
  Minimize2,
  Shapes,
  Square,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useLanguage,
} from '../lead-ui-kit';
import type { LeadMapDrawMode } from './lead-map-types';

const BTN =
  'pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/95 text-muted-foreground shadow-theme-md backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';
const BTN_ACTIVE = 'border-primary/50 bg-primary/10 text-primary';

export function LeadMapToolbar({
  onFitAll,
  drawMode,
  onSetDrawMode,
  hasArea,
  onClearArea,
  isFullscreen,
  onToggleFullscreen,
  className,
}: {
  onFitAll: () => void;
  drawMode: LeadMapDrawMode;
  onSetDrawMode: (mode: LeadMapDrawMode) => void;
  hasArea: boolean;
  onClearArea: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  className?: string;
}) {
  const { t } = useLanguage();
  const drawItems: { mode: Exclude<LeadMapDrawMode, null>; icon: LucideIcon; label: string }[] = [
    { mode: 'rectangle', icon: Square, label: t('leads.map.draw.rectangle', 'Rectangle') },
    { mode: 'circle', icon: Circle, label: t('leads.map.draw.circle', 'Circle') },
    { mode: 'polygon', icon: Hexagon, label: t('leads.map.draw.polygon', 'Polygon') },
  ];

  return (
    <div className={cn('pointer-events-none flex flex-col gap-1.5', className)}>
      <button type="button" className={BTN} onClick={onFitAll} title={t('leads.map.fitAll', 'Fit all leads')} aria-label={t('leads.map.fitAll', 'Fit all leads')}>
        <Maximize className="h-4 w-4" aria-hidden="true" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(BTN, (drawMode || hasArea) && BTN_ACTIVE)}
            title={t('leads.map.draw.title', 'Select an area')}
            aria-label={t('leads.map.draw.title', 'Select an area')}
          >
            <Shapes className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="start" className="w-52">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            {t('leads.map.draw.hint', 'Draw a shape to select the leads inside it')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {drawItems.map(({ mode, icon: Icon, label }) => (
            <DropdownMenuItem
              key={mode}
              onSelect={() => onSetDrawMode(drawMode === mode ? null : mode)}
              className={cn('gap-2', drawMode === mode && 'text-primary')}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </DropdownMenuItem>
          ))}
          {drawMode || hasArea ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onClearArea} className="gap-2" variant="destructive">
                <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                {t('leads.map.draw.clear', 'Clear selection area')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        className={BTN}
        onClick={onToggleFullscreen}
        title={isFullscreen ? t('leads.map.exitFullscreen', 'Exit fullscreen') : t('leads.map.fullscreen', 'Fullscreen')}
        aria-label={isFullscreen ? t('leads.map.exitFullscreen', 'Exit fullscreen') : t('leads.map.fullscreen', 'Fullscreen')}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
