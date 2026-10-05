'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }) {
  // next-themes 0.4.6 renders its no-flash bootstrap as a regular <script>.
  // React 19.2 / Next 16.2 warns when that provider is rendered again on the
  // client because dynamically inserted executable scripts are ignored. Keep
  // the executable script for SSR (where it prevents a theme flash), but make
  // client re-renders inert. The script itself already has
  // suppressHydrationWarning, so this intentional type difference is safe.
  const scriptProps = typeof window === 'undefined'
    ? undefined
    : { type: 'application/json' };

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  );
}
