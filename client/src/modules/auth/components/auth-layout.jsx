'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Shield, FolderKanban, BarChart3, Users } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { APP_LOGOS, APP_PRODUCT_NAME, COMPANY_NAME } from '@/shared/constants/application';

const features = [
  { icon: FolderKanban, labelKey: 'auth.layout.feature.projects', fallback: 'Projektmanagement' },
  { icon: Users, labelKey: 'auth.layout.feature.customers', fallback: 'Kundenmanagement' },
  { icon: BarChart3, labelKey: 'auth.layout.feature.accounting', fallback: 'Buchhaltung & Finanzen' },
  { icon: Shield, labelKey: 'auth.layout.feature.roles', fallback: 'Rollen & Berechtigungen' },
];

export function AuthLayout({ children }) {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branded */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900" />

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-white/5 blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-white/5 blur-3xl translate-y-1/3 -translate-x-1/4" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgMGg2MHY2MEgweiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjMwIiBjeT0iMzAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNikiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZykiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=')] opacity-60" />

        {/* Content */}
        <div className="relative flex flex-col justify-between p-10 xl:p-14 w-full">
          {/* Logo */}
          <Link href="/" className="flex items-center" aria-label={APP_PRODUCT_NAME}>
            {/* White variant: the panel is always the brand gradient, in both themes */}
            <Image src={APP_LOGOS.fullDark} alt={APP_PRODUCT_NAME} priority width={220} height={56} className="h-11 w-auto object-contain" />
          </Link>

          {/* Middle content */}
          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight leading-tight lg:text-2xl 2xl:text-3xl">
                {t('auth.layout.headline1', 'Ihr zentrales')}
                <br />
                {t('auth.layout.headline2', 'Werkzeug für')}
                <br />
                {t('auth.layout.headline3', 'den Arbeitsalltag')}
              </h2>
              <p className="mt-4 text-base text-white/60 leading-relaxed max-w-xs">
                {t('auth.layout.subtitle', 'Projekte, Kunden und Finanzen - alles in einer modernen Plattform.')}
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-3">
              {features.map((f) => (
                <div key={f.labelKey} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm">
                    <f.icon className="h-4 w-4 text-white/80" />
                  </div>
                  <span className="text-sm font-medium text-white/75">{t(f.labelKey, f.fallback)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} {COMPANY_NAME}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col">
        {/* Mobile logo bar */}
        <div className="flex items-center p-6 lg:hidden">
          <Image src={APP_LOGOS.full} alt={APP_PRODUCT_NAME} priority width={220} height={56} className="block h-9 w-auto object-contain dark:hidden" />
          <Image src={APP_LOGOS.fullDark} alt={APP_PRODUCT_NAME} priority width={220} height={56} className="hidden h-9 w-auto object-contain dark:block" />
        </div>

        {/* Form container */}
        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="w-full max-w-[420px]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
