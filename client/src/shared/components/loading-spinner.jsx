'use client';

import Image from 'next/image';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOptionalLanguage } from '@/lib/i18n/language-context';
import { APP_LOGOS, APP_PRODUCT_NAME } from '@/shared/constants/application';

export function LoadingSpinner({ className, size = 'default' }) {
  const language = useOptionalLanguage();
  const sizeClass = { sm: 'size-4', default: 'size-6', lg: 'size-10' }[size];
  return <div role="status" aria-label={language?.t('common.loading') || APP_PRODUCT_NAME} className={cn('flex items-center justify-center p-2', className)}>
    <LoaderCircle aria-hidden="true" className={cn('animate-spin text-primary motion-reduce:animate-none', sizeClass)} />
  </div>;
}

export function FullPageSpinner() {
  const language = useOptionalLanguage();
  return <div className="notranslate fixed inset-0 z-[9999] grid place-items-center bg-background text-foreground" role="status" aria-live="polite" aria-busy="true" aria-label={language?.t('common.loading') || APP_PRODUCT_NAME} translate="no" data-no-translation="true">
    <div className="flex flex-col items-center px-6 py-10">
      <div className="grid size-16 place-items-center rounded-2xl border border-border bg-card shadow-sm">
        <Image src={APP_LOGOS.mark} alt="" width={40} height={40} priority className="dark:hidden" />
        <Image src={APP_LOGOS.markDark} alt="" width={40} height={40} priority className="hidden dark:block" />
      </div>
      <p className="mt-5 text-sm font-semibold tracking-tight">{APP_PRODUCT_NAME}</p>
      <div aria-hidden="true" className="mt-4 flex items-center gap-1.5">{[0, 1, 2].map(index => <span key={index} className="size-1.5 animate-pulse rounded-full bg-primary/60 motion-reduce:animate-none" style={{ animationDelay: `${index * 150}ms` }} />)}</div>
    </div>
  </div>;
}
