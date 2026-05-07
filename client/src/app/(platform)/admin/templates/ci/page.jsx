'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/shared/components/page-header';
import { CIConfigForm } from '@/modules/doctpl/components/CIConfigForm';
import { CIAssetUploader } from '@/modules/doctpl/components/CIAssetUploader';

export default function CIConfigPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/templates">
          <Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <PageHeader
          title="CI Configuration"
          description="Company identity — applied to all generated documents"
        />
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-sm">Company Details</h3>
        <CIConfigForm />
      </div>

      <Separator />

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Brand Assets</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Upload logo and Museo Sans font files (TTF/OTF). Fallback: Helvetica until fonts are uploaded.
          </p>
        </div>
        <CIAssetUploader />
      </div>
    </div>
  );
}
