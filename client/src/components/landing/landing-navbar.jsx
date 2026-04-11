'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, Globe, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

export function LandingNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const { t, locale, toggleLanguage } = useLanguage();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { label: t('nav.features'), href: '#features' },
    { label: t('nav.modules'), href: '#modules' },
  ];

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        isScrolled
          ? 'glass border-b border-border/40 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]'
          : 'bg-transparent'
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[72px] items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky-500 shadow-md shadow-primary/25 transition-transform duration-200 group-hover:scale-105">
              <Zap className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-[1.1rem] font-bold tracking-tight">
              MB Boiler{' '}
              <span className="text-gradient">ERP</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="relative rounded-full px-4 py-2 text-[0.875rem] font-medium text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-primary/5"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-primary/5"
            >
              <Globe className="h-3.5 w-3.5" />
              {locale === 'de' ? 'EN' : 'DE'}
            </button>
            <Button className="rounded-full shadow-md shadow-primary/25 text-[0.875rem]" asChild>
              <Link href="/login">{t('nav.login')}</Link>
            </Button>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Globe className="h-3.5 w-3.5" />
              {locale === 'de' ? 'EN' : 'DE'}
            </button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">{t('nav.openMenu')}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 border-l-0 p-0">
                <div className="flex flex-col h-full">
                  <div className="p-6 pb-2">
                    <Link href="/" className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky-500">
                        <Zap className="h-4.5 w-4.5 text-white" />
                      </div>
                      <span className="text-lg font-bold tracking-tight">
                        MB Boiler <span className="text-gradient">ERP</span>
                      </span>
                    </Link>
                  </div>
                  <nav className="flex-1 px-4 py-4">
                    {navLinks.map((link) => (
                      <SheetClose key={link.href} asChild>
                        <a
                          href={link.href}
                          className="flex items-center rounded-xl px-4 py-3.5 text-[0.925rem] font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-accent"
                        >
                          {link.label}
                        </a>
                      </SheetClose>
                    ))}
                  </nav>
                  <div className="border-t p-4">
                    <Button className="w-full rounded-xl h-11 shadow-md shadow-primary/25" asChild>
                      <Link href="/login">{t('nav.login')}</Link>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
