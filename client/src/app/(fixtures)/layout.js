'use client';

import { ThemeProvider } from '@/providers/theme-provider';
import { LanguageProvider } from '@/lib/i18n/language-context';

export default function FixtureLayout({ children }) {
  if (process.env.NODE_ENV === 'production') {
    return <div>Not available</div>;
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        {children}
      </LanguageProvider>
    </ThemeProvider>
  );
}
