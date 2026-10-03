'use client';

import { Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

// Each entry carries its endonym (language name in its own language). `dir`
// pins the item's own text direction so the Arabic label renders RTL even
// while the surrounding UI is still LTR (and vice-versa).
const LOCALES = [
  { code: 'de', label: 'Deutsch', short: 'DE', dir: 'ltr' },
  { code: 'en', label: 'English', short: 'EN', dir: 'ltr' },
  { code: 'fr', label: 'Français', short: 'FR', dir: 'ltr' },
  { code: 'ar', label: 'العربية', short: 'AR', dir: 'rtl' },
];

export function LanguageToggle({ compact = false, align = 'end' }) {
  const { locale, setLocale } = useLanguage();
  const active = LOCALES.find((l) => l.code === locale) || LOCALES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground h-8 px-2"
          aria-label="Change language"
        >
          <Globe className="h-3.5 w-3.5" />
          <span className={compact ? 'sr-only sm:not-sr-only' : 'hidden sm:inline'}>{active.short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-40">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            dir={l.dir}
            onSelect={(e) => { e.preventDefault(); setLocale(l.code); }}
            className={cn('gap-2', locale === l.code && 'font-medium')}
            aria-current={locale === l.code ? 'true' : undefined}
          >
            <span className="font-mono text-[10px] text-muted-foreground w-6">{l.short}</span>
            <span className="flex-1">{l.label}</span>
            {locale === l.code && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
