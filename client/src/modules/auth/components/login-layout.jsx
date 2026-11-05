'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, PhoneCall, Radar, ShieldCheck } from 'lucide-react';
import { LanguageToggle } from '@/layout/language-toggle';
import { ThemeToggle } from '@/layout/theme-toggle';
import { useLanguage } from '@/lib/i18n/language-context';
import { APP_LOGOS, APP_PRODUCT_NAME, COMPANY_NAME } from '@/shared/constants/application';
import styles from './login-layout.module.css';

const features = [
  [Radar, 'landing.nav.leadGeneration'],
  [PhoneCall, 'experience.calling.nav'],
  [ShieldCheck, 'landing.footer.security'],
];

export function LoginLayout({ children }) {
  const { t } = useLanguage();

  return (
    <div className={styles.layout}>
      <aside className={styles.showcase}>
        <div className={styles.grid} aria-hidden="true" />
        <Link href="/" aria-label={APP_PRODUCT_NAME} className={styles.brand}>
          <Image src={APP_LOGOS.fullDark} alt={APP_PRODUCT_NAME} priority width={220} height={56} className="h-10 w-auto" />
        </Link>

        <div className={styles.scene} aria-hidden="true">
          <div className={styles.aura} />
          <div className={styles.orbit}><span /></div>
          <div className={styles.orbitInner}><span /></div>
          <div className={styles.sculpture}>
            <Image src="/landing/ai-voice-sculpture-1280.webp" alt="" fill priority sizes="(min-width: 1024px) 48vw, 1px" className="object-contain" />
          </div>
          <div className={styles.sphere} />
          <div className={styles.sphereSmall} />
          <div className={styles.sceneLabel}><span />{APP_PRODUCT_NAME}</div>
        </div>

        <div className={styles.story}>
          <div className={styles.eyebrow}><span />{APP_PRODUCT_NAME}</div>
          <h2>{t('experience.auth.title')}</h2>
          <p>{t('experience.auth.body')}</p>
          <div className={styles.features}>
            {features.map(([Icon, key]) => (
              <span key={key}><Icon aria-hidden="true" />{t(key)}</span>
            ))}
          </div>
        </div>
        <div className={styles.showcaseFooter}>
          <span>© {new Date().getFullYear()} {COMPANY_NAME}</span>
          <span aria-hidden="true" className={styles.footerDetail}><i /><i /><i /></span>
        </div>
      </aside>

      <div className={styles.content}>
        <header className={styles.header}>
          <Link href="/" className={styles.productLink}>
            <ArrowUpRight aria-hidden="true" className="size-4 rtl:rotate-180" />
            {t('landing.nav.product')}
          </Link>
          <div className="flex items-center gap-1"><LanguageToggle /><ThemeToggle /></div>
        </header>
        <main className={styles.main}>
          <div className={styles.form}>
            <Link href="/" className="mb-10 inline-block lg:hidden">
              <Image src={APP_LOGOS.full} alt={APP_PRODUCT_NAME} priority width={220} height={56} className="block h-9 w-auto dark:hidden" />
              <Image src={APP_LOGOS.fullDark} alt={APP_PRODUCT_NAME} priority width={220} height={56} className="hidden h-9 w-auto dark:block" />
            </Link>
            {children}
          </div>
        </main>
        <footer className={styles.contentFooter}>
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          <span>{APP_PRODUCT_NAME}</span><span className={styles.footerDot} />
          <span>{t('landing.footer.security')}</span>
        </footer>
      </div>
    </div>
  );
}
