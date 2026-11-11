'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, UploadCloud, FileText, FileCheck2, Archive, ArchiveRestore, Send, Trash2, X, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { downloadFromUrl } from '@/lib/api/download';
import { useAiStore } from '@/modules/ai/store/ai-store';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';
import {
  useArchiveRepositoryDocument, useVisumRepositoryDocument, useReleaseRepositoryDocument, useDeleteRepositoryDocument,
  useDocumentRepository, useDownloadRepositoryDocument, useDownloadRepositoryDocumentAttachment,
  useDocumentStats, useDocumentFacets, useBulkRepositoryDocuments,
} from '../hooks/use-document-repository';
import { DocumentsHero } from './documents-hero';
import { DocumentRepositoryFilters } from './document-repository-filters';
import { DocumentRepositoryTable } from './document-repository-table';
import { DocumentUploadDialog } from './document-upload-dialog';
import { DocumentEditDialog } from './document-edit-dialog';

const PAGE_SIZE = 25;
const SECTIONS = [
  { id: 'documents', icon: FileText, key: 'documents.hub.section.documents', fallback: 'Documents', tone: 'text-sky-600 dark:text-sky-300' },
  { id: 'visum', icon: FileCheck2, key: 'documents.hub.section.visum', fallback: 'Signed off', tone: 'text-emerald-600 dark:text-emerald-300' },
  { id: 'archiv', icon: Archive, key: 'documents.hub.section.archiv', fallback: 'Archive', tone: 'text-amber-600 dark:text-amber-300' },
];
const FILTER_KEYS = ['q', 'source', 'origin', 'type', 'category', 'from', 'to', 'sort'];

export function DocumentsHubPage() {
  const { t, locale } = useLanguage();
  const nf = new Intl.NumberFormat(intlLocaleFor(locale));
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { hasPermission, isAdmin } = usePermissions();
  const canWrite = isAdmin || hasPermission(PERMISSIONS.DOCUMENTS_WRITE);
  const canDelete = isAdmin || hasPermission(PERMISSIONS.DOCUMENTS_DELETE);
  const openPanelWithPrompt = useAiStore((s) => s.openPanelWithPrompt);

  const section = SECTIONS.some((s) => s.id === params.get('section')) ? params.get('section') : 'documents';
  const source = params.get('source') || 'all';
  const origin = params.get('origin') || 'all';
  const documentType = params.get('type') || '';
  const category = params.get('category') || '';
  const dateFrom = params.get('from') || '';
  const dateTo = params.get('to') || '';
  const sortOrder = params.get('sort') === 'asc' ? 'asc' : 'desc';
  const [search, setSearch] = useState(params.get('q') || '');
  const debouncedSearch = useDebounce(search, 300).trim();
  const [cursorStack, setCursorStack] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [preview, setPreview] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const setParams = useCallback((patch) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '' || v === 'all') next.delete(k); else next.set(k, String(v));
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setCursorStack([]);
    setSelected(new Set());
  }, [params, pathname, router]);

  useEffect(() => {
    if ((params.get('q') || '') !== debouncedSearch) setParams({ q: debouncedSearch || null });
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCursor = cursorStack[cursorStack.length - 1];
  const filters = useMemo(() => ({
    limit: PAGE_SIZE,
    section,
    source,
    origin,
    sortOrder,
    ...(activeCursor ? { cursor: activeCursor } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(documentType ? { documentType } : {}),
    ...(category ? { category } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  }), [activeCursor, category, dateFrom, dateTo, debouncedSearch, documentType, origin, section, sortOrder, source]);

  const { data, isLoading, isFetching, error, refetch } = useDocumentRepository(filters);
  const { data: stats, isLoading: statsLoading } = useDocumentStats();
  const { data: facets } = useDocumentFacets();
  const download = useDownloadRepositoryDocument();
  const downloadAttachment = useDownloadRepositoryDocumentAttachment();
  const remove = useDeleteRepositoryDocument();
  const archiveMutation = useArchiveRepositoryDocument();
  const visumMutation = useVisumRepositoryDocument();
  const releaseMutation = useReleaseRepositoryDocument();
  const bulk = useBulkRepositoryDocuments();
  const documents = data?.items ?? [];
  const pagination = data?.pagination ?? {};
  const pageStart = cursorStack.length * PAGE_SIZE;

  const run = async (doc, fn, okKey) => {
    setBusyId(doc.id);
    try {
      await fn();
      if (okKey) showSuccess(t(okKey));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handlers = {
    onPreview: (doc) => run(doc, async () => {
      const payload = await download.mutateAsync(doc.id);
      setPreview({ url: payload?.downloadUrl, fileName: payload?.fileName || doc.fileName });
    }),
    onDownload: (doc) => run(doc, async () => {
      const payload = await downloadAttachment.mutateAsync(doc.id);
      if (!payload?.downloadUrl) throw new Error(t('documents.repository.noDownloadUrl'));
      await downloadFromUrl(payload.downloadUrl, payload.fileName || doc.fileName);
    }),
    onVisum: canWrite ? (doc) => {
      const next = !(doc.visumBy || doc.visum);
      return run(doc, () => visumMutation.mutateAsync({ id: doc.id, visiert: next }), next ? 'documents.repository.visumSetDone' : 'documents.repository.visumRemovedDone');
    } : undefined,
    onRelease: canWrite ? (doc) => {
      const next = !doc.releasedToField;
      return run(doc, () => releaseMutation.mutateAsync({ id: doc.id, released: next }), next ? 'documents.repository.releasedDone' : 'documents.repository.releaseRevokedDone');
    } : undefined,
    onArchive: canWrite ? (doc) => {
      const next = !doc.archived;
      return run(doc, () => archiveMutation.mutateAsync({ id: doc.id, archived: next }), next ? 'documents.repository.archived' : 'documents.repository.unarchived');
    } : undefined,
    onEdit: canWrite ? setEditDoc : undefined,
    onDelete: canDelete ? setDeleteTarget : undefined,
  };

  const toggle = (id) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (on) => setSelected(on ? new Set(documents.map((d) => d.id)) : new Set());

  const runBulk = async (action) => {
    const ids = [...selected];
    try {
      const res = await bulk.mutateAsync({ action, ids });
      if (res.failed?.length) showError(t('documents.hub.bulk.partial', '{ok} done, {failed} failed: {reason}', { ok: res.succeeded, failed: res.failed.length, reason: res.failed[0].error }));
      else showSuccess(t('documents.hub.bulk.done', '{count} documents updated', { count: res.succeeded }));
      setSelected(new Set());
      setBulkConfirm(null);
      if (action === 'delete' || ['archive', 'unarchive', 'visum', 'unvisum'].includes(action)) setCursorStack([]);
    } catch (err) {
      showError(err);
    }
  };

  const sectionCount = (id) => stats?.sections?.[id];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <DocumentsHero
        stats={stats}
        loading={statsLoading}
        canWrite={canWrite}
        onUpload={() => setUploadOpen(true)}
        onAskAi={() => openPanelWithPrompt(t('documents.hub.aiPrompt', 'Find the documents for '))}
        onSection={(id) => setParams({ section: id === 'documents' ? null : id })}
      />

      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1 [scrollbar-width:none]" role="tablist" aria-label={t('documents.hub.sections', 'Sections')}>
        {SECTIONS.map(({ id, icon: Icon, key, fallback, tone }) => {
          const active = section === id;
          const count = sectionCount(id);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setParams({ section: id === 'documents' ? null : id })}
              className={cn('inline-flex flex-1 shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition sm:flex-none', active ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')}
            >
              <Icon className={cn('size-4', active && tone)} aria-hidden="true" />
              {t(key, fallback)}
              {count != null ? <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-background' : 'bg-muted')}>{nf.format(count)}</span> : null}
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
        facets={facets}
        onSearchChange={setSearch}
        onSourceChange={(v) => setParams({ source: v })}
        onOriginChange={(v) => setParams({ origin: v })}
        onDocumentTypeChange={(v) => setParams({ type: v })}
        onCategoryChange={(v) => setParams({ category: v })}
        onDateFromChange={(v) => setParams({ from: v })}
        onDateToChange={(v) => setParams({ to: v })}
        onSortOrderChange={(v) => setParams({ sort: v === 'asc' ? 'asc' : null })}
        onRefresh={() => refetch()}
        onReset={() => { setSearch(''); setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null]))); }}
        isFetching={isFetching}
      />

      <div className={cn('transition-opacity', isFetching && !isLoading && 'opacity-70')}>
        <DocumentRepositoryTable
          documents={documents}
          loading={isLoading}
          error={error}
          busyId={busyId}
          canDelete={canDelete}
          selectable={canWrite}
          selectedIds={selected}
          onToggleSelect={toggle}
          onToggleAll={toggleAll}
          emptyAction={canWrite && section === 'documents' ? (
            <Button className="gap-2 rounded-full" onClick={() => setUploadOpen(true)}><UploadCloud className="size-4" />{t('documents.repository.upload')}</Button>
          ) : null}
          {...handlers}
        />
      </div>

      {documents.length ? (
        <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label={t('common.pagination', 'Pagination')}>
          <p className="text-sm tabular-nums text-muted-foreground">
            {t('documents.hub.range', '{from}–{to}', { from: nf.format(pageStart + 1), to: nf.format(pageStart + documents.length) })}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full" disabled={!cursorStack.length || isFetching} onClick={() => { setCursorStack((s) => s.slice(0, -1)); setSelected(new Set()); }}>
              <ChevronLeft className="size-4 rtl:rotate-180" />{t('common.previous')}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full" disabled={!pagination.hasNext || !pagination.nextCursor || isFetching} onClick={() => { setCursorStack((s) => [...s, pagination.nextCursor]); setSelected(new Set()); }}>
              {t('common.next')}<ChevronRight className="size-4 rtl:rotate-180" />
            </Button>
          </div>
        </nav>
      ) : null}

      {/* Bulk action bar */}
      {selected.size ? (
        <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#0a1324]/95 p-2.5 text-white shadow-[0_20px_60px_-15px_rgba(14,165,233,0.5)] backdrop-blur-xl sm:inset-x-6" role="region" aria-label={t('documents.hub.bulk.label', 'Bulk actions')}>
          <span className="px-2 text-sm font-medium tabular-nums">{t('documents.hub.bulk.selected', '{count} selected', { count: selected.size })}</span>
          <div className="ms-auto flex flex-wrap items-center gap-1">
            {section === 'archiv' ? (
              <BulkButton icon={ArchiveRestore} label={t('documents.repository.unarchive')} onClick={() => runBulk('unarchive')} busy={bulk.isPending} />
            ) : (
              <BulkButton icon={Archive} label={t('documents.repository.archive')} onClick={() => runBulk('archive')} busy={bulk.isPending} />
            )}
            {section === 'visum' ? (
              <BulkButton icon={FileCheck2} label={t('documents.repository.visumRemove')} onClick={() => runBulk('unvisum')} busy={bulk.isPending} />
            ) : section === 'documents' ? (
              <BulkButton icon={FileCheck2} label={t('documents.repository.visumSet')} onClick={() => runBulk('visum')} busy={bulk.isPending} />
            ) : null}
            <BulkButton icon={Send} label={t('documents.repository.release')} onClick={() => runBulk('release')} busy={bulk.isPending} />
            {canDelete ? <BulkButton icon={Trash2} danger label={t('common.delete')} onClick={() => setBulkConfirm('delete')} busy={bulk.isPending} /> : null}
            <button type="button" onClick={() => setSelected(new Set())} className="grid size-9 place-items-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label={t('documents.hub.bulk.clear', 'Clear selection')}>
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <DocumentEditDialog doc={editDoc} onOpenChange={(o) => !o && setEditDoc(null)} />
      <DocumentPreviewDrawer open={!!preview} url={preview?.url} fileName={preview?.fileName} onClose={() => setPreview(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('documents.repository.deleteTitle')}
        description={deleteTarget ? t('documents.repository.deleteDescription', null, { name: deleteTarget.fileName || deleteTarget.title }) : ''}
        confirmText={t('common.delete')}
        variant="destructive"
        onConfirm={async () => {
          await run(deleteTarget, () => remove.mutateAsync(deleteTarget.id), 'documents.repository.deleted');
          setDeleteTarget(null);
          setCursorStack([]);
        }}
        isLoading={remove.isPending}
      />
      <ConfirmDialog
        open={bulkConfirm === 'delete'}
        onOpenChange={(open) => !open && setBulkConfirm(null)}
        title={t('documents.hub.bulk.deleteTitle', 'Delete {count} documents?', { count: selected.size })}
        description={t('documents.hub.bulk.deleteDesc', 'The selected files are removed. Accounting documents still under retention are skipped.')}
        confirmText={t('common.delete')}
        variant="destructive"
        onConfirm={() => runBulk('delete')}
        isLoading={bulk.isPending}
      />
    </div>
  );
}

function BulkButton({ icon: Icon, label, onClick, busy, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition disabled:opacity-50', danger ? 'text-rose-300 hover:bg-rose-500/15' : 'text-slate-100 hover:bg-white/10')}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
