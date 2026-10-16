// Single source of truth for colour. Values are transcribed from the web CRM's
// `client/src/app/globals.css` (`:root` and `.dark`). Tailwind classes such as
// `bg-primary` resolve to the CSS variables that `ThemeProvider` derives from
// these objects, so a token changes in exactly one place.

export const brand = {
  50: '#EEF2FB',
  100: '#D9E1F5',
  200: '#B3C3EB',
  300: '#8AA4F0',
  400: '#6E8BE8',
  500: '#4E74DB',
  600: '#2F52B8',
  700: '#1C388E',
  800: '#162C6F',
  900: '#101F4E',
  /** The CRM logo tile — anchors heroes and the brand gradient. */
  navy: '#102A56',
  navyDeep: '#0A1B3A',
  red: '#D00A19',
} as const;

export type ColorScheme = 'light' | 'dark';

export type SemanticColors = {
  background: string;
  surface: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  info: string;
  infoForeground: string;
  border: string;
  input: string;
  ring: string;
};

export const palettes: Record<ColorScheme, SemanticColors> = {
  light: {
    background: '#F7F8FC',
    surface: '#FFFFFF',
    foreground: '#111827',
    card: '#FFFFFF',
    cardForeground: '#111827',
    primary: brand[700],
    primaryForeground: '#FFFFFF',
    secondary: brand[600],
    secondaryForeground: '#FFFFFF',
    muted: '#F1F5F9',
    mutedForeground: '#6B7280',
    accent: brand[50],
    accentForeground: brand[700],
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',
    success: '#22C55E',
    successForeground: '#FFFFFF',
    warning: '#F59E0B',
    warningForeground: '#111827',
    info: '#3B82F6',
    infoForeground: '#FFFFFF',
    border: '#E5E7EB',
    input: '#E5E7EB',
    ring: brand[700],
  },
  dark: {
    background: '#0F172A',
    surface: '#111827',
    foreground: '#E5E7EB',
    card: '#111827',
    cardForeground: '#E5E7EB',
    primary: brand[500],
    primaryForeground: '#FFFFFF',
    secondary: '#1F2937',
    secondaryForeground: '#E5E7EB',
    muted: '#1F2937',
    mutedForeground: '#9CA3AF',
    accent: brand[800],
    accentForeground: brand[200],
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',
    success: '#22C55E',
    successForeground: '#FFFFFF',
    warning: '#F59E0B',
    warningForeground: '#111827',
    info: '#60A5FA',
    infoForeground: '#0F172A',
    border: '#1F2937',
    input: '#1F2937',
    ring: brand[400],
  },
};

/** `#1C388E` + 0.2 → `rgba(28, 56, 142, 0.2)`, for raw-style APIs (shadows, rings, SVG). */
export function withAlpha(hex: string, alpha: number): string {
  return `rgba(${hexToChannels(hex).split(' ').join(', ')}, ${alpha})`;
}

/** `#1C388E` → `28 56 142`, the channel format Tailwind's `<alpha-value>` needs. */
export function hexToChannels(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** `primaryForeground` → `--color-primary-foreground`. */
export function cssVarName(token: keyof SemanticColors): string {
  return `--color-${token.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
}

export function toCssVariables(colors: SemanticColors): Record<string, string> {
  const entries = Object.entries(colors) as [keyof SemanticColors, string][];
  return Object.fromEntries(entries.map(([token, hex]) => [cssVarName(token), hexToChannels(hex)]));
}
