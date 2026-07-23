'use client';

import Link from 'next/link';
import { LayoutDashboard, Users, Shield, ScrollText, ArrowRight } from 'lucide-react';
import { useIntersection } from '@/shared/hooks/use-intersection';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const cards = [
  { key: 'dashboard', icon: LayoutDashboard, href: '/dashboard', gradient: 'from-[#7B61FF] to-[#5B3FD4]' },
  { key: 'users', icon: Users, href: '/settings/users', gradient: 'from-brand-500 to-brand-600' },
  { key: 'roles', icon: Shield, href: '/settings/roles', gradient: 'from-emerald-500 to-green-600' },
  { key: 'audit', icon: ScrollText, href: '/settings/audit', gradient: 'from-amber-500 to-orange-600' },
];

export function QuickAccessSection() {
  const [ref, isInView] = useIntersection({ threshold: 0.1 });
  const { t } = useLanguage();

  return (
    <section ref={ref} className="py-24 sm:py-32 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            'text-center max-w-2xl mx-auto mb-16 transition-all duration-700',
            isInView ? 'animate-in fade-in slide-in-from-bottom-6' : 'opacity-0'
          )}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 border border-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary mb-6">
            {t('quickAccess.label')}
          </div>
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl 2xl:text-3xl">
            {t('quickAccess.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('quickAccess.subtitle')}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card, i) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.key}
                href={card.href}
                className={cn(
                  'group relative rounded-2xl border border-border/40 p-6 glass hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300 overflow-hidden',
                  isInView ? 'animate-in fade-in slide-in-from-bottom-6' : 'opacity-0',
                )}
                style={{ animationDelay: isInView ? `${i * 80}ms` : undefined, animationFillMode: 'both' }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="relative">
                  <div className={cn(
                    'mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-md transition-transform duration-300 group-hover:scale-110',
                    card.gradient
                  )}>
                    <Icon className="h-5.5 w-5.5 text-white" />
                  </div>
                  <h3 className="font-bold text-[0.95rem] mb-1.5">
                    {t(`quickAccess.${card.key}.title`)}
                  </h3>
                  <p className="text-[0.85rem] text-muted-foreground leading-relaxed mb-4">
                    {t(`quickAccess.${card.key}.desc`)}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:gap-2.5 transition-all duration-200">
                    {t('nav.login')}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
