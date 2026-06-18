'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Eye, History, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { PageHeader } from '@/shared/components/page-header';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';
import { TemplateEditor } from '@/modules/doctpl/components/TemplateEditor';
import { TemplateVersionHistory } from '@/modules/doctpl/components/TemplateVersionHistory';
import { useTemplateDetail } from '@/modules/doctpl/hooks/useTemplateQueries';
import { usePreviewTemplate, useUpdateTemplate } from '@/modules/doctpl/hooks/useTemplateMutations';

export default function TemplateDetailPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const { data: template, isLoading } = useTemplateDetail(id);
  const update = useUpdateTemplate();
  const preview = usePreviewTemplate();

  const [draft, setDraft] = useState(null);
  const [changeDesc, setChangeDesc] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [validationIssues, setValidationIssues] = useState([]);

  const current = draft || template;

  useEffect(() => {
    if (!draft) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [draft]);

  const handleEditorValidation = useCallback((issues) => {
    setValidationIssues(issues);
  }, []);

  const handleSave = async () => {
    if (!draft || !changeDesc.trim() || validationIssues.length) return;
    await update.mutateAsync({
      id,
      ...draft,
      expectedVersion: template.currentVersion,
      changeDescription: changeDesc.trim(),
    });
    setDraft(null);
    setChangeDesc('');
  };

  const handlePreview = async () => {
    const response = await preview.mutateAsync({
      id,
      sampleData: {},
      language: 'de',
      draftTemplate: draft || undefined,
    });
    setPreviewUrl(response?.data?.downloadUrl || null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  if (!current) {
    return <div className="p-6 text-sm text-muted-foreground">{t('doctpl.templates.notFound')}</div>;
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/admin/templates">
            <Button size="icon" variant="ghost">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <PageHeader
            title={current.name}
            description={`v${current.currentVersion} - ${t(`doctpl.type.${current.templateType}`, current.templateType)}`}
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="gap-1.5" onClick={handlePreview} disabled={preview.isPending}>
            <Eye className="h-4 w-4" />
            {preview.isPending ? t('doctpl.templates.generating') : t('doctpl.templates.preview')}
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setShowHistory((value) => !value)}>
            <History className="h-4 w-4" />
            {t('doctpl.templates.history')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 rounded-lg border bg-card p-5 shadow-sm">
          <TemplateEditor template={current} onChange={setDraft} onValidationChange={handleEditorValidation} />

          {draft && (
            <div className="mt-5 space-y-3 border-t pt-4">
              <div>
                <Label>{t('doctpl.templates.changeDescription')} <span className="text-destructive">*</span></Label>
                <Input
                  value={changeDesc}
                  onChange={(event) => setChangeDesc(event.target.value)}
                  placeholder={t('doctpl.templates.changePlaceholder')}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={!changeDesc.trim() || update.isPending || validationIssues.length > 0} className="gap-1.5">
                  <Save className="h-4 w-4" />
                  {update.isPending ? t('doctpl.templates.saving') : t('doctpl.templates.saveChanges')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft(null);
                    setChangeDesc('');
                  }}
                >
                  <X className="mr-1 h-4 w-4" />
                  {t('doctpl.templates.discard')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {showHistory && (
          <aside className="w-full shrink-0 rounded-lg border bg-card p-5 shadow-sm xl:w-96">
            <h3 className="mb-3 text-sm font-semibold">{t('doctpl.templates.history')}</h3>
            <TemplateVersionHistory templateId={id} expectedVersion={current.currentVersion} />
          </aside>
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
