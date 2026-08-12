'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/shared/components/page-header';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { DOCUMENT_SECTIONS } from '@/modules/pm/constants/pm-constants';
import { showError, showSuccess } from '@/lib/toast';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';
import { DocumentRepositoryFilters } from '@/modules/documents/components/document-repository-filters';
import { DocumentRepositoryTable } from '@/modules/documents/components/document-repository-table';
import { DocumentUploadDialog } from '@/modules/documents/components/document-upload-dialog';
import { downloadFromUrl } from '@/lib/api/download';
import {
  useArchiveRepositoryDocument,
  useDeleteRepositoryDocument,
  useDocumentRepository,
  useDownloadRepositoryDocument,
  useDownloadRepositoryDocumentAttachment,
} from '@/modules/documents/hooks/use-document-repository';

const PAGE_SIZE = 25;

export default function DocumentsPage() {
  const [section, setSection] = useState('documents');
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
  const { t, language } = useLanguage();
  const { hasPermission, isAdmin } = usePermissions();
  const canWrite = isAdmin || hasPermission(PERMISSIONS.DOCUMENTS_WRITE);
  const canDelete = isAdmin || hasPermission(PERMISSIONS.DOCUMENTS_DELETE);
  const activeCursor = cursorStack[cursorStack.length - 1] || undefined;

  const filters = useMemo(() => ({
    limit: PAGE_SIZE,
    section,
    source,
    origin,
    sortOrder,
    ...(activeCursor ? { cursor: activeCursor } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(documentType.trim() ? { documentType: documentType.trim() } : {}),
    ...(category.trim() ? { category: category.trim() } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  }), [activeCursor, category, dateFrom, dateTo, debouncedSearch, documentType, origin, sortOrder, source, section]);

  const { data, isLoading, isFetching, error, refetch } = useDocumentRepository(filters);
  const download = useDownloadRepositoryDocument();
  const downloadAttachment = useDownloadRepositoryDocumentAttachment();
  const remove = useDeleteRepositoryDocument();
  const archiveMutation = useArchiveRepositoryDocument();
  const documents = data?.items ?? [];
  const pagination = data?.pagination ?? {};

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const resetPaging = useCallback(() => {
    setCursorStack([]);
  }, []);

  const filterHandlers = useMemo(() => ({
    onSearchChange: (value) => {
      setSearch(value);
      resetPaging();
    },
    onSourceChange: (value) => {
      setSource(value);
      resetPaging();
    },
    onOriginChange: (value) => {
      setOrigin(value);
      resetPaging();
    },
    onDocumentTypeChange: (value) => {
      setDocumentType(value);
      resetPaging();
    },
    onCategoryChange: (value) => {
      setCategory(value);
      resetPaging();
    },
    onDateFromChange: (value) => {
      setDateFrom(value);
      resetPaging();
    },
    onDateToChange: (value) => {
      setDateTo(value);
      resetPaging();
    },
    onSortOrderChange: (value) => {
      setSortOrder(value);
      resetPaging();
    },
  }), [resetPaging]);

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
      const payload = await downloadAttachment.mutateAsync(doc.id);
      if (payload?.downloadUrl) {
        await downloadFromUrl(payload.downloadUrl, payload.fileName || doc.fileName);
      } else {
        showError(t('documents.repository.noDownloadUrl'));
      }
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

  const handleArchive = async (doc) => {
    setBusyId(doc.id);
    try {
      const newArchived = !doc.archived;
      await archiveMutation.mutateAsync({ id: doc.id, archived: newArchived });
      showSuccess(t(newArchived ? 'documents.repository.archived' : 'documents.repository.unarchived'));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
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

      {/* Section tabs — Dokumente / Dokumente mit Visum / Archiv */}
      <div className="flex items-center gap-1 border-b border-border/60">
        {DOCUMENT_SECTIONS.map((sec) => {
          const SectionIcon = sec.icon;
          const active = section === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => { setSection(sec.id); resetPaging(); }}
              className={cn(
                'relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active ? sec.activeCls : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <SectionIcon className="h-3.5 w-3.5" />
              {language === 'de' ? sec.label : sec.labelEn}
            </button>
          );
        })}
      </div>

      <DocumentRepositoryFilters
        search={search}
        source={source}
        origin={origin}
        documentType={documentType}
        category={category}
        dateFrom={dateFrom}
        dateTo={dateTo}
        sortOrder={sortOrder}
        onSearchChange={filterHandlers.onSearchChange}
        onSourceChange={filterHandlers.onSourceChange}
        onOriginChange={filterHandlers.onOriginChange}
        onDocumentTypeChange={filterHandlers.onDocumentTypeChange}
        onCategoryChange={filterHandlers.onCategoryChange}
        onDateFromChange={filterHandlers.onDateFromChange}
        onDateToChange={filterHandlers.onDateToChange}
        onSortOrderChange={filterHandlers.onSortOrderChange}
        onRefresh={handleRefresh}
        isFetching={isFetching}
      />

      <DocumentRepositoryTable
        documents={documents}
        loading={isLoading}
        error={error}
        onPreview={handlePreview}
        onDownload={handleDownload}
        onDelete={canDelete ? setDeleteTarget : undefined}
        onArchive={handleArchive}
        busyId={busyId}
        canDelete={canDelete}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isFetching && !isLoading
            ? t('documents.repository.refreshing')
            : t('documents.repository.pageCount', null, { count: documents.length })}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 sm:w-auto"
            disabled={cursorStack.length === 0 || isFetching}
            onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('common.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 sm:w-auto"
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
