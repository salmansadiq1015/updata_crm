'use client';
import { useRef } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';

export const PANEL_MIN = 320;
export const PANEL_MAX = 720;
export const clampWidth = (w: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, w)));

/**
 * Drag handle on the inner edge of the right panel (pointer + keyboard: arrows ±16 px,
 * Home/End = min/max, double-click resets). Works in RTL, where the panel sits on the left.
 */
export function PanelResizer({ width, onResize }: { width: number; onResize: (w: number | null) => void }) {
  const { t } = useLanguage();
  const drag = useRef<{ x: number; w: number; rtl: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    drag.current = { x: e.clientX, w: width, rtl };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const delta = d.rtl ? e.clientX - d.x : d.x - e.clientX;
    onResize(clampWidth(d.w + delta));
  };
  const end = (e: React.PointerEvent<HTMLDivElement>) => { drag.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const grow = rtl ? 'ArrowRight' : 'ArrowLeft'; const shrink = rtl ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === grow) onResize(clampWidth(width + 16));
    else if (e.key === shrink) onResize(clampWidth(width - 16));
    else if (e.key === 'Home') onResize(PANEL_MIN);
    else if (e.key === 'End') onResize(PANEL_MAX);
    else return;
    e.preventDefault();
  };
  return (
    <div role="separator" aria-orientation="vertical" tabIndex={0} aria-valuemin={PANEL_MIN} aria-valuemax={PANEL_MAX} aria-valuenow={width}
      aria-label={t('workflowBuilder.panel.resize', 'Resize panel')} title={t('workflowBuilder.panel.resizeHint', 'Drag to resize · double-click to reset')}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end} onKeyDown={onKeyDown} onDoubleClick={() => onResize(null)}
      className="absolute inset-y-0 -start-1 z-20 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:start-[3px] after:w-0.5 after:bg-transparent after:transition-colors hover:after:bg-sky-500/60 focus-visible:after:bg-sky-500" />
  );
}
