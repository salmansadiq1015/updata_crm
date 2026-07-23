'use client';

import {
  Building2, FolderKanban, Calendar, FileText,
  Receipt, ClipboardList, Package, Bot,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useIntersection } from '@/shared/hooks/use-intersection';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const featureKeys = [
  { key: 'crm', icon: Building2, gradient: 'from-[#7B61FF] to-[#5B3FD4]', href: '/crm' },
  { key: 'pm', icon: FolderKanban, gradient: 'from-brand-500 to-brand-600', href: '/projects' },
  { key: 'scheduling', icon: Calendar, gradient: 'from-emerald-500 to-green-600', href: '#', comingSoon: true },
  { key: 'quotes', icon: FileText, gradient: 'from-amber-500 to-orange-600', href: '#', comingSoon: true },
  { key: 'accounting', icon: Receipt, gradient: 'from-rose-500 to-pink-600', href: '#', comingSoon: true },
  { key: 'tasks', icon: ClipboardList, gradient: 'from-indigo-500 to-brand-600', href: '#', comingSoon: true },
  { key: 'catalog', icon: Package, gradient: 'from-teal-500 to-cyan-600', href: '#', comingSoon: true },
  { key: 'ai', icon: Bot, gradient: 'from-brand-500 to-brand-600', href: '#', comingSoon: true },
];

export function FeaturesSection() {
  const [ref, isInView] = useIntersection({ threshold: 0.05 });
  const { t } = useLanguage();

  return (
    <section id="features" className="py-28 sm:py-36 relative" ref={ref}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            'text-center max-w-2xl mx-auto mb-20 transition-all duration-700',
            isInView ? 'animate-in fade-in slide-in-from-bottom-6' : 'opacity-0'
          )}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 border border-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary mb-6">
            {t('features.label')}
          </div>
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl lg:text-[1.5rem] 2xl:text-[2rem]">
            {t('features.title')}
          </h2>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            {t('features.subtitle')}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" style={{ perspective: '1200px' }}>
          {featureKeys.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <a
                key={feature.key}
                href={feature.comingSoon ? undefined : feature.href}
                className={cn(
                  'group relative rounded-2xl border border-border/40 bg-card p-6 transition-all duration-300 overflow-hidden cursor-default',
                  !feature.comingSoon && 'hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 cursor-pointer',
                  feature.comingSoon && 'opacity-75',
                  isInView ? 'animate-in fade-in slide-in-from-bottom-6' : 'opacity-0',
                )}
                style={{
                  animationDelay: isInView ? `${i * 60}ms` : undefined,
                  animationFillMode: 'both',
                  transformStyle: 'preserve-3d',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="relative">
                  <div className="flex items-start justify-between mb-5">
                    <div className={cn(
                      'inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm transition-transform duration-300',
                      !feature.comingSoon && 'group-hover:scale-110',
                      feature.gradient
                    )}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    {feature.comingSoon && (
                      <Badge variant="secondary" className="text-[0.65rem] px-2 py-0.5 font-medium">
                        {t('features.comingSoon')}
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-[0.95rem] mb-2">{t(`features.${feature.key}.title`)}</h3>
                  <p className="text-[0.85rem] text-muted-foreground leading-relaxed">
                    {t(`features.${feature.key}.desc`)}
                  </p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
