'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/lib/i18n/language-context';
import { PageHeader } from '@/shared/components/page-header';
import { CIAssetUploader } from '@/modules/doctpl/components/CIAssetUploader';
import { CIAuditPanel } from '@/modules/doctpl/components/CIAuditPanel';
import { CIConfigForm } from '@/modules/doctpl/components/CIConfigForm';

export default function CIConfigPage() {
  const { t } = useLanguage();

  return (
    <div className="flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/templates">
          <Button size="icon" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title={t('doctpl.ci.title')}
          description={t('doctpl.ci.description')}
        />
      </div>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <CIAuditPanel />
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold">{t('doctpl.ci.companyDetails')}</h3>
        <CIConfigForm />
      </section>

      <Separator />

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">{t('doctpl.ci.brandAssets')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('doctpl.ci.assetHelp')}</p>
        </div>
        <CIAssetUploader />
      </section>
    </div>
  );
}
