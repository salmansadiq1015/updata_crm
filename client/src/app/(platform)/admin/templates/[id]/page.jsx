'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, Save, History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/shared/components/page-header';
import { TemplateEditor } from '@/modules/doctpl/components/TemplateEditor';
import { TemplateVersionHistory } from '@/modules/doctpl/components/TemplateVersionHistory';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';
import { useTemplateDetail } from '@/modules/doctpl/hooks/useTemplateQueries';
import { useUpdateTemplate, usePreviewTemplate } from '@/modules/doctpl/hooks/useTemplateMutations';

export default function TemplateDetailPage() {
  const { id } = useParams();
  const { data: template, isLoading } = useTemplateDetail(id);
  const update  = useUpdateTemplate();
  const preview = usePreviewTemplate();

  const [draft, setDraft]           = useState(null);
  const [changeDesc, setChangeDesc] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [previewUrl, setPreviewUrl]   = useState(null);

  const current = draft || template;

  const handleSave = async () => {
    if (!changeDesc.trim()) return;
    await update.mutateAsync({ id, ...draft, changeDescription: changeDesc });
    setDraft(null);
    setChangeDesc('');
  };

  const handlePreview = async () => {
    const r = await preview.mutateAsync({ id, sampleData: {}, language: 'de' });
    setPreviewUrl(r?.data?.downloadUrl || null);
  };

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-[400px] rounded-xl" />
    </div>
  );

  if (!current) return (
    <div className="p-6 text-sm text-muted-foreground">Template not found.</div>
  );

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/templates">
            <Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <PageHeader title={current.name} description={`v${current.currentVersion} · ${current.templateType}`} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={handlePreview} disabled={preview.isPending}>
            <Eye className="h-4 w-4" />{preview.isPending ? 'Generating…' : 'Preview'}
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setShowHistory((s) => !s)}>
            <History className="h-4 w-4" />History
          </Button>
        </div>
      </div>

      <div className="flex gap-5 items-start">
        <div className="flex-1 rounded-xl border bg-card p-5 min-w-0">
          <TemplateEditor template={current} onChange={setDraft} />

          {draft && (
            <div className="mt-5 pt-4 border-t space-y-3">
              <div>
                <Label>Change description <span className="text-destructive">*</span></Label>
                <Input
                  value={changeDesc}
                  onChange={(e) => setChangeDesc(e.target.value)}
                  placeholder="e.g. Updated footer text for French"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={!changeDesc.trim() || update.isPending} className="gap-1.5">
                  <Save className="h-4 w-4" />{update.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button variant="ghost" onClick={() => { setDraft(null); setChangeDesc(''); }}>
                  <X className="h-4 w-4 mr-1" />Discard
                </Button>
              </div>
            </div>
          )}
        </div>

        {showHistory && (
          <div className="w-80 shrink-0 rounded-xl border bg-card p-5">
            <h3 className="font-semibold text-sm mb-3">Version History</h3>
            <TemplateVersionHistory templateId={id} />
          </div>
        )}
      </div>

      <DocumentPreviewDrawer
        open={!!previewUrl}
        url={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />
    </div>
  );
}
