'use client';

import Link from 'next/link';
import { ArrowRight, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIntersection } from '@/shared/hooks/use-intersection';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

export function CtaSection() {
  const [ref, isInView] = useIntersection({ threshold: 0.15 });
  const { t } = useLanguage();

  return (
    <section ref={ref} className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            'relative rounded-3xl overflow-hidden transition-all duration-700',
            isInView ? 'animate-in fade-in slide-in-from-bottom-8' : 'opacity-0'
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#7B61FF] via-primary to-[#5B3FD4] animate-gradient" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,255,255,0.08),transparent_50%)]" />

          <div className="relative px-8 py-20 sm:px-16 sm:py-24 text-center">
            <h2 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl lg:text-3xl 2xl:text-4xl max-w-3xl mx-auto leading-tight">
              {t('cta.title')}
            </h2>
            <p className="mt-6 text-lg text-white/75 max-w-2xl mx-auto leading-relaxed">
              {t('cta.subtitle')}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Button
                size="lg"
                className="gap-2.5 text-[0.95rem] px-8 h-12 rounded-xl bg-white text-primary hover:bg-white/90 shadow-xl shadow-black/10 font-semibold transition-all"
                asChild
              >
                <Link href="/login">
                  {t('cta.start')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2.5 text-[0.95rem] px-8 h-12 rounded-xl border-white/25 text-white hover:bg-white/10 bg-transparent font-semibold transition-all"
                asChild
              >
                <a href="mailto:it-support@mbboiler.ch">
                  <Headphones className="h-4 w-4" />
                  {t('cta.contact')}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
