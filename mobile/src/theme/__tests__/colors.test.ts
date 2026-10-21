import { palettes } from '../colors';

type Rgb = [number, number, number];

function channels(hex: string): Rgb {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function luminance(rgb: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return linear(rgb[0]) * 0.2126 + linear(rgb[1]) * 0.7152 + linear(rgb[2]) * 0.0722;
}

function contrast(foreground: Rgb, background: Rgb): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// WCAG normal-text contrast applies to small labels, placeholders and badges,
// not just body copy. Test actual composited tints as well as solid surfaces.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
describe('light theme text contrast', () => {
  const light = palettes.light;
  const surfaces = [light.background, light.card, light.muted];

  it.each(['foreground', 'mutedForeground', 'primary'] as const)(
    '%s stays readable on light surfaces',
    (token) => {
      for (const surface of surfaces) {
        expect(contrast(channels(light[token]), channels(surface))).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(['success', 'warning', 'destructive', 'info'] as const)(
    '%s stays readable as text, a tinted badge, and a filled action',
    (token) => {
      const foreground = channels(light[token]);
      for (const surface of surfaces) {
        const background = channels(surface);
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
        const alpha = token === 'warning' ? 0.15 : 0.1;
        const mix = (index: 0 | 1 | 2) => background[index] * (1 - alpha) + foreground[index] * alpha;
        const tinted: Rgb = [mix(0), mix(1), mix(2)];
        expect(contrast(foreground, tinted)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(channels(light[`${token}Foreground`]), foreground)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['light', 'dark'] as const)('keeps selected settings readable in %s mode', (scheme) => {
    const colors = palettes[scheme];
    for (const background of [colors.accent, colors.card]) {
      expect(contrast(channels(colors.accentForeground), channels(background))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
