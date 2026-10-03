'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

// Vector map overlays (Circle / Rectangle / Polygon) are drawn by the Maps SDK,
// so they need concrete color strings rather than Tailwind classes. To still
// honour the app's semantic tokens (and inherit the brand + light/dark), we
// resolve the CSS custom properties to rgb() at runtime via a probe element.
// DOM markers/controls use Tailwind token classes directly and don't need this.

export interface MapTokenColors {
  /** Resolved --primary, e.g. "rgb(28, 56, 142)". */
  primary: string;
  /** Resolved --border. */
  border: string;
  /** Resolved --muted-foreground (neutral stroke). */
  neutral: string;
  /** Translucent primary fill for selected areas. */
  primaryFill: string;
}

const FALLBACK: MapTokenColors = {
  primary: 'rgb(28, 56, 142)',
  border: 'rgb(229, 231, 235)',
  neutral: 'rgb(107, 114, 128)',
  primaryFill: 'rgba(28, 56, 142, 0.15)',
};

/** Resolve a CSS custom property (e.g. "--primary") to an rgb() string. */
export function resolveCssColor(token: string): string | null {
  if (typeof document === 'undefined') return null;
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  try {
    const resolved = getComputedStyle(probe).color;
    return resolved || null;
  } finally {
    probe.remove();
  }
}

/** Turn "rgb(r, g, b)" into "rgba(r, g, b, alpha)". Falls back gracefully. */
export function withAlpha(rgb: string, alpha: number): string {
  const match = rgb.match(/^rgba?\(([^)]+)\)$/);
  if (!match) return rgb;
  const parts = match[1].split(',').map((p) => p.trim());
  const [r, g, b] = parts;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Resolves the semantic tokens the map overlays need, re-reading them whenever
 * the next-themes theme changes so light/dark stay in sync.
 */
export function useMapTokenColors(): MapTokenColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<MapTokenColors>(FALLBACK);

  useEffect(() => {
    // Reading resolved CSSOM values is a client-only measurement of an external
    // system (the stylesheet), so it must happen after render, in an effect.
    const primary = resolveCssColor('--primary') ?? FALLBACK.primary;
    const border = resolveCssColor('--border') ?? FALLBACK.border;
    const neutral = resolveCssColor('--muted-foreground') ?? FALLBACK.neutral;
    const next: MapTokenColors = {
      primary,
      border,
      neutral,
      primaryFill: withAlpha(primary, 0.15),
    };
    // Re-read tokens on every theme flip; skip the state write when unchanged.
    // Intentional: this syncs React state FROM an external system (the CSSOM),
    // which can only be measured after the DOM renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColors((prev) =>
      prev.primary === next.primary && prev.border === next.border && prev.neutral === next.neutral
        ? prev
        : next,
    );
  }, [resolvedTheme]);

  return colors;
}
