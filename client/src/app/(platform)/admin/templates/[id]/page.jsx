'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Eye, History, Save, Send, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { PageHeader } from '@/shared/components/page-header';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';
import { TemplateEditor } from '@/modules/doctpl/components/TemplateEditor';
import { TemplateVersionHistory } from '@/modules/doctpl/components/TemplateVersionHistory';
import { useTemplateDetail } from '@/modules/doctpl/hooks/useTemplateQueries';
import {
  useApproveTemplate,
  usePreviewTemplate,
  useRejectTemplate,
  useRequestTemplateApproval,
  useUpdateTemplate,
} from '@/modules/doctpl/hooks/useTemplateMutations';

const APPROVAL_BADGE = {
  draft: { key: 'doctpl.approval.draft', className: '' },
  pending: { key: 'doctpl.approval.pending', className: 'border-amber-500 text-amber-600' },
  approved: { key: 'doctpl.approval.approved', className: 'border-green-600 text-green-700' },
  rejected: { key: 'doctpl.approval.rejected', className: 'border-destructive text-destructive' },
};

export default function TemplateDetailPage() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const { id } = useParams();
  const { data: template, isLoading } = useTemplateDetail(id);
  const update = useUpdateTemplate();
  const preview = usePreviewTemplate();
  const requestApproval = useRequestTemplateApproval();
  const approve = useApproveTemplate();
  const reject = useRejectTemplate();

  const [draft, setDraft] = useState(null);
  const [changeDesc, setChangeDesc] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [validationIssues, setValidationIssues] = useState([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const current = draft || template;
  const status = current?.approvalStatus || 'draft';
  const badge = APPROVAL_BADGE[status] || APPROVAL_BADGE.draft;
  const approvalBusy = requestApproval.isPending || approve.isPending || reject.isPending;
  const canWrite = hasPermission('templates:write');
  const canAdmin = hasPermission('templates:admin');

  const handleRequestApproval = async () => {
    if (!canWrite) return;
    try {
      await requestApproval.mutateAsync({ id });
      showSuccess(t('doctpl.approval.requested'));
    } catch (error) {
      showError(error);
    }
  };

  const handleApprove = async () => {
    if (!canAdmin) return;
    try {
      await approve.mutateAsync({ id });
      showSuccess(t('doctpl.approval.approvedToast'));
    } catch (error) {
      showError(error);
    }
  };

  const handleReject = async () => {
    if (!canAdmin || !rejectReason.trim()) return;
    try {
      await reject.mutateAsync({ id, reason: rejectReason.trim() });
      showSuccess(t('doctpl.approval.rejectedToast'));
      setRejectOpen(false);
      setRejectReason('');
    } catch (error) {
      showError(error);
    }
  };

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
    if (!canWrite || !draft || !changeDesc.trim() || validationIssues.length) return;
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
    try {
      const response = await preview.mutateAsync({
        id,
        sampleData: {},
        language: 'de',
        draftTemplate: draft || undefined,
      });
      const url = response?.data?.downloadUrl || null;
      if (url) setPreviewUrl(url);
      else showError(t('doctpl.templates.previewFailed', 'Die Vorschau konnte nicht erstellt werden.'));
    } catch (error) {
      showError(error);
    }
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
          <Badge variant="outline" className={badge.className}>{t(badge.key)}</Badge>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canWrite && (status === 'draft' || status === 'rejected') && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={handleRequestApproval}
              disabled={approvalBusy || !!draft}
              title={draft ? t('doctpl.approval.saveFirst') : undefined}
            >
              <Send className="h-4 w-4" />
              {t('doctpl.approval.request')}
            </Button>
          )}
          {canAdmin && status === 'pending' && (
            <>
              <Button
                className="gap-1.5"
                onClick={handleApprove}
                disabled={approvalBusy || !!draft}
                title={draft ? t('doctpl.approval.saveFirst') : undefined}
              >
                <CheckCircle2 className="h-4 w-4" />
                {t('doctpl.approval.approve')}
              </Button>
              <Button
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setRejectOpen(true)}
                disabled={approvalBusy}
              >
                <XCircle className="h-4 w-4" />
                {t('doctpl.approval.reject')}
              </Button>
            </>
          )}
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

      {status === 'rejected' && current.rejectionReason && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span className="font-medium">{t('doctpl.approval.rejectionReasonLabel')}:</span> {current.rejectionReason}
        </div>
      )}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 rounded-lg border bg-card p-5 shadow-sm">
          <TemplateEditor template={current} onChange={canWrite ? setDraft : undefined} onValidationChange={handleEditorValidation} />

          {canWrite && draft && (
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
            <TemplateVersionHistory templateId={id} expectedVersion={current.currentVersion} canRevert={canAdmin} />
          </aside>
        )}
      </div>

      <DocumentPreviewDrawer
        open={!!previewUrl}
        url={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />

      <Dialog open={rejectOpen} onOpenChange={(open) => { setRejectOpen(open); if (!open) setRejectReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('doctpl.approval.rejectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label>{t('doctpl.approval.rejectReason')} <span className="text-destructive">*</span></Label>
            <Textarea
              rows={4}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder={t('doctpl.approval.rejectPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectOpen(false); setRejectReason(''); }}>
              {t('common.cancel')}
            </Button>
            <Button
              className="gap-1.5"
              onClick={handleReject}
              disabled={!canAdmin || !rejectReason.trim() || reject.isPending}
            >
              <XCircle className="h-4 w-4" />
              {t('doctpl.approval.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
