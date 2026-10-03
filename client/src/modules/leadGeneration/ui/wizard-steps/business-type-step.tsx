'use client';

// Wizard step 2 — Business type. Thin wrapper around the grid so the step shell
// stays consistent with the others.

import { useLanguage } from '@/lib/i18n/language-context';
import { BusinessTypeGrid } from '../../components/business-type-grid';

export function BusinessTypeStep() {
  const { t } = useLanguage();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('leadgen.step.businessType.title', 'Choose business types')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('leadgen.step.businessType.subtitle', 'Pick one or more categories, or add a custom type.')}
        </p>
      </div>
      <BusinessTypeGrid />
    </div>
  );
}
