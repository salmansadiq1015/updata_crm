'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/shared/components/page-header';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';
import { DocumentRepositoryTable } from '@/modules/documents/components/document-repository-table';
import { DocumentUploadDialog } from '@/modules/documents/components/document-upload-dialog';
import {
  useDeleteRepositoryDocument,
  useDocumentRepository,
  useDownloadRepositoryDocument,
} from '@/modules/documents/hooks/use-document-repository';
import {
  DOCUMENT_ORIGIN_OPTIONS,
  DOCUMENT_SOURCE_OPTIONS,
} from '@/modules/documents/utils/document-formatters';

const PAGE_SIZE = 25;

export default function DocumentsPage() {
  const [source, setSource] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [search, setSearch] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [cursorStack, setCursorStack] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const debouncedSearch = useDebounce(search, 300).trim();
  const { t } = useLanguage();
  const { hasPermission, isAdmin } = usePermissions();
  const canWrite = isAdmin || hasPermission(PERMISSIONS.DOCUMENTS_WRITE);
  const canDelete = isAdmin || hasPermission(PERMISSIONS.DOCUMENTS_DELETE);
  const activeCursor = cursorStack[cursorStack.length - 1] || undefined;

  const filters = useMemo(() => ({
    limit: PAGE_SIZE,
    source,
    origin,
    sortOrder,
    ...(activeCursor ? { cursor: activeCursor } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(documentType.trim() ? { documentType: documentType.trim() } : {}),
    ...(category.trim() ? { category: category.trim() } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  }), [activeCursor, category, dateFrom, dateTo, debouncedSearch, documentType, origin, sortOrder, source]);

  const { data, isLoading, isFetching, error, refetch } = useDocumentRepository(filters);
  const download = useDownloadRepositoryDocument();
  const remove = useDeleteRepositoryDocument();
  const documents = data?.items ?? [];
  const pagination = data?.pagination ?? {};

  const resetPaging = () => {
    setCursorStack([]);
  };

  const handleFilterChange = (setter) => (value) => {
    setter(value);
    resetPaging();
  };

  const handleTextFilterChange = (setter) => (event) => {
    setter(event.target.value);
    resetPaging();
  };

  const openDownloadUrl = (payload) => {
    if (payload?.downloadUrl) {
      window.open(payload.downloadUrl, '_blank', 'noopener,noreferrer');
      return true;
    }
    return false;
  };

  const handlePreview = async (doc) => {
    setBusyId(doc.id);
    try {
      const payload = await download.mutateAsync(doc.id);
      setPreview({ url: payload?.downloadUrl, fileName: payload?.fileName || doc.fileName });
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (doc) => {
    setBusyId(doc.id);
    try {
      const payload = await download.mutateAsync(doc.id);
      if (!openDownloadUrl(payload)) showError(t('documents.repository.noDownloadUrl'));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await remove.mutateAsync(deleteTarget.id);
      showSuccess(t('documents.repository.deleted'));
      setDeleteTarget(null);
      resetPaging();
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader
        title={t('documents.repository.titlePage')}
        description={t('documents.repository.pageDescription')}
      >
        {canWrite ? (
          <Button className="gap-2" onClick={() => setUploadOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            {t('documents.repository.upload')}
          </Button>
        ) : null}
      </PageHeader>

      <div className="grid gap-3 rounded-lg border bg-background p-4 shadow-sm xl:grid-cols-[minmax(260px,1fr)_170px_170px_140px_140px_140px_140px_130px_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleTextFilterChange(setSearch)}
            placeholder={t('documents.repository.searchPlaceholder')}
            className="pl-9"
          />
        </div>

        <Select value={source} onValueChange={handleFilterChange(setSource)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DOCUMENT_SOURCE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={origin} onValueChange={handleFilterChange(setOrigin)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DOCUMENT_ORIGIN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={documentType}
          onChange={handleTextFilterChange(setDocumentType)}
          placeholder={t('documents.repository.type')}
        />
        <Input
          value={category}
          onChange={handleTextFilterChange(setCategory)}
          placeholder={t('documents.repository.category')}
        />
        <Input
          type="date"
          value={dateFrom}
          onChange={handleTextFilterChange(setDateFrom)}
          aria-label={t('documents.repository.dateFrom')}
        />
        <Input
          type="date"
          value={dateTo}
          onChange={handleTextFilterChange(setDateTo)}
          aria-label={t('documents.repository.dateTo')}
        />

        <Select value={sortOrder} onValueChange={handleFilterChange(setSortOrder)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">{t('documents.repository.newest')}</SelectItem>
            <SelectItem value="asc">{t('documents.repository.oldest')}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <DocumentRepositoryTable
        documents={documents}
        loading={isLoading}
        error={error}
        onPreview={handlePreview}
        onDownload={handleDownload}
        onDelete={canDelete ? setDeleteTarget : undefined}
        busyId={busyId}
        canDelete={canDelete}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isFetching && !isLoading
            ? t('documents.repository.refreshing')
            : t('documents.repository.pageCount', null, { count: documents.length })}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={cursorStack.length === 0 || isFetching}
            onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('common.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!pagination.hasNext || !pagination.nextCursor || isFetching}
            onClick={() => setCursorStack((stack) => [...stack, pagination.nextCursor])}
          >
            {t('common.next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <DocumentPreviewDrawer
        open={!!preview}
        url={preview?.url}
        fileName={preview?.fileName}
        onClose={() => setPreview(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('documents.repository.deleteTitle')}
        description={deleteTarget ? t('documents.repository.deleteDescription', null, { name: deleteTarget.fileName || deleteTarget.title }) : ''}
        confirmText={t('common.delete')}
        onConfirm={handleDelete}
        isLoading={remove.isPending}
      />
    </div>
  );
}
