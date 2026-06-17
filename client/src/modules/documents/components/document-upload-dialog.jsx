'use client';

import { useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { useUploadRepositoryDocument } from '../hooks/use-document-repository';
import {
  DOCUMENT_CATEGORY_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  LINK_TYPE_OPTIONS,
} from '../utils/document-formatters';

const initialForm = {
  title: '',
  documentType: 'OTHER',
  category: 'OTHER',
  folderPath: '',
  description: '',
  sourceRecordType: 'none',
  sourceRecordId: '',
  customerId: '',
  projectId: '',
  jobId: '',
  employeeId: '',
};

function appendIfPresent(formData, key, value) {
  const normalized = `${value || ''}`.trim();
  if (normalized) formData.append(key, normalized);
}

export function DocumentUploadDialog({ open, onOpenChange }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(initialForm);
  const fileInputRef = useRef(null);
  const upload = useUploadRepositoryDocument();
  const { t } = useLanguage();

  const linkIdLabel = useMemo(() => {
    switch (form.sourceRecordType) {
      case 'customer':
        return t('documents.repository.customerId');
      case 'project':
        return t('documents.repository.projectId');
      case 'job':
        return t('documents.repository.jobId');
      case 'employee':
        return t('documents.repository.employeeId');
      default:
        return t('documents.repository.linkedRecordId');
    }
  }, [form.sourceRecordType, t]);

  const reset = () => {
    setFile(null);
    setForm(initialForm);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      showError(t('documents.repository.selectFileFirst'));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    appendIfPresent(formData, 'title', form.title);
    appendIfPresent(formData, 'documentType', form.documentType);
    appendIfPresent(formData, 'category', form.category);
    appendIfPresent(formData, 'folderPath', form.folderPath);
    appendIfPresent(formData, 'description', form.description);

    if (form.sourceRecordType !== 'none') {
      appendIfPresent(formData, 'sourceRecordType', form.sourceRecordType);
      appendIfPresent(formData, 'sourceRecordId', form.sourceRecordId);
    }
    appendIfPresent(formData, 'customerId', form.customerId);
    appendIfPresent(formData, 'projectId', form.projectId);
    appendIfPresent(formData, 'jobId', form.jobId);
    appendIfPresent(formData, 'employeeId', form.employeeId);

    try {
      await upload.mutateAsync(formData);
      showSuccess(t('documents.repository.uploaded'));
      reset();
      onOpenChange?.(false);
    } catch (error) {
      showError(error);
    }
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && !upload.isPending) reset();
    onOpenChange?.(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('documents.repository.uploadTitle')}</DialogTitle>
          <DialogDescription>
            {t('documents.repository.uploadDescription')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="rounded-lg border border-dashed bg-muted/30 p-4">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            {file ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background">
                    <FileUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.type || t('documents.repository.unknownFileType')}</p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} disabled={upload.isPending}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full flex-col items-center justify-center gap-2 rounded-md py-6 text-sm text-muted-foreground transition hover:bg-background/70"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="h-6 w-6" />
                <span>{t('documents.repository.selectFileHelp')}</span>
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="document-title">{t('documents.repository.title')}</Label>
              <Input
                id="document-title"
                value={form.title}
                onChange={(event) => setField('title', event.target.value)}
                placeholder={file?.name || t('documents.repository.optionalTitle')}
                disabled={upload.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('documents.repository.documentType')}</Label>
              <Select value={form.documentType} onValueChange={(value) => setField('documentType', value)} disabled={upload.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('documents.repository.category')}</Label>
              <Select value={form.category} onValueChange={(value) => setField('category', value)} disabled={upload.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-path">{t('documents.repository.folder')}</Label>
              <Input
                id="folder-path"
                value={form.folderPath}
                onChange={(event) => setField('folderPath', event.target.value)}
                placeholder={t('documents.repository.folderPlaceholder')}
                disabled={upload.isPending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label>{t('documents.repository.directLink')}</Label>
              <Select value={form.sourceRecordType} onValueChange={(value) => setField('sourceRecordType', value)} disabled={upload.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LINK_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-record-id">{linkIdLabel}</Label>
              <Input
                id="source-record-id"
                value={form.sourceRecordId}
                onChange={(event) => setField('sourceRecordId', event.target.value)}
                placeholder={t('documents.repository.recordIdPlaceholder')}
                disabled={upload.isPending || form.sourceRecordType === 'none'}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer-id">{t('documents.repository.customerId')}</Label>
              <Input id="customer-id" value={form.customerId} onChange={(event) => setField('customerId', event.target.value)} disabled={upload.isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-id">{t('documents.repository.projectId')}</Label>
              <Input id="project-id" value={form.projectId} onChange={(event) => setField('projectId', event.target.value)} disabled={upload.isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-id">{t('documents.repository.jobId')}</Label>
              <Input id="job-id" value={form.jobId} onChange={(event) => setField('jobId', event.target.value)} disabled={upload.isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-id">{t('documents.repository.employeeId')}</Label>
              <Input id="employee-id" value={form.employeeId} onChange={(event) => setField('employeeId', event.target.value)} disabled={upload.isPending} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-description">{t('documents.repository.descriptionField')}</Label>
            <Textarea
              id="document-description"
              value={form.description}
              onChange={(event) => setField('description', event.target.value)}
              rows={3}
              disabled={upload.isPending}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={upload.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="gap-2" disabled={upload.isPending}>
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {t('documents.repository.upload')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
