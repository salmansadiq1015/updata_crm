'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { APP_NAME, SUPPORT_EMAIL } from '@/shared/constants/application';

export function LandingFooter() {
  const { t } = useLanguage();

  const footerLinks = [
    {
      title: t('footer.product'),
      links: [
        { label: t('footer.product.features'), href: '#features' },
        { label: t('footer.product.modules'), href: '#modules' },
        { label: t('footer.product.docs'), href: '#' },
      ],
    },
    {
      title: t('footer.support'),
      links: [
        { label: t('footer.support.help'), href: '#' },
        { label: t('footer.support.it'), href: `mailto:${SUPPORT_EMAIL}` },
        { label: t('footer.support.status'), href: '#' },
        { label: t('footer.support.training'), href: '#' },
      ],
    },
    {
      title: t('footer.legal'),
      links: [
        { label: t('footer.legal.imprint'), href: '#' },
        { label: t('footer.legal.privacy'), href: '#' },
        { label: t('footer.legal.terms'), href: '#' },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/40 bg-card/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 py-14 sm:py-16 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-1 lg:pr-4">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br bg-primary-gradient shadow-md shadow-primary/20">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">
                {APP_NAME} <span className="text-gradient">ERP</span>
              </span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              {t('footer.description')}
            </p>
          </div>

          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold mb-4">{section.title}</h3>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/40 py-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {t('footer.copyright')}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-4 text-center">&#127464;&#127469;</span>
            {t('footer.madeIn')}
          </div>
        </div>
      </div>
    </footer>
  );
}
