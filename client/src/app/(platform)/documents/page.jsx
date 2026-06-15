'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/shared/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DocumentsTable } from '@/modules/doctpl/components/DocumentsTable';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';
import { useDocuments } from '@/modules/doctpl/hooks/useDocumentQueries';
import { useDeleteDocument, useDownloadDocument } from '@/modules/doctpl/hooks/useDocumentMutations';

const DOC_TYPES = [
  ['all', 'All Types'],
  ['quotation', 'Quotation'],
  ['order_confirmation', 'Order Confirmation'],
  ['invoice_standard', 'Invoice'],
  ['invoice_advance', 'Advance Invoice'],
  ['invoice_final', 'Final Invoice'],
  ['cover_letter', 'Cover Letter'],
  ['service_report', 'Service Report'],
  ['inspection_certificate', 'Inspection Certificate'],
];

export default function DocumentsPage() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [cursorStack, setCursorStack] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [preview, setPreview] = useState(null);
  const activeCursor = cursorStack[cursorStack.length - 1] || undefined;
  const filters = {
    limit: 25,
    sortBy: 'generatedAt',
    sortOrder,
    ...(activeCursor ? { cursor: activeCursor } : {}),
    ...(typeFilter !== 'all' ? { documentType: typeFilter } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  };
  const { data, isLoading, isFetching, isError, refetch } = useDocuments(filters);
  const download = useDownloadDocument();
  const remove = useDeleteDocument();
  const documents = data?.items ?? [];
  const pagination = data?.pagination ?? {};

  const resetPaging = () => {
    setCursorStack([]);
    setSelectedIds([]);
  };

  const handlePreview = async (doc) => {
    const response = await download.mutateAsync(doc._id);
    setPreview({ url: response?.data?.downloadUrl, fileName: doc.fileName });
  };

  const handleDownload = async (doc) => {
    const response = await download.mutateAsync(doc._id);
    if (response?.data?.downloadUrl) window.open(response.data.downloadUrl, '_blank', 'noopener,noreferrer');
  };

  const handleBulkDelete = async () => {
    const ids = selectedIds.filter(Boolean);
    for (const id of ids) {
      await remove.mutateAsync(id);
    }
    setSelectedIds([]);
    refetch();
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader
        title="Generated Documents"
        description="Search, review, download, and clean up generated PDFs"
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPaging();
              }}
              placeholder="Search file, customer, project"
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(value) => { setTypeFilter(value); resetPaging(); }}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(value) => { setSortOrder(value); resetPaging(); }}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest first</SelectItem>
              <SelectItem value="asc">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="destructive"
            className="gap-2"
            onClick={handleBulkDelete}
            disabled={!selectedIds.length || remove.isPending}
          >
            <Trash2 className="h-4 w-4" />
            Delete {selectedIds.length || ''}
          </Button>
        </div>
      </div>

      <DocumentsTable
        documents={documents}
        loading={isLoading}
        error={isError}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onPreview={handlePreview}
        onDownload={handleDownload}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {isFetching && !isLoading ? 'Refreshing documents...' : `${documents.length} documents on this page`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={cursorStack.length === 0}
            onClick={() => {
              setCursorStack((stack) => stack.slice(0, -1));
              setSelectedIds([]);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!pagination.hasNext || !pagination.nextCursor}
            onClick={() => {
              setCursorStack((stack) => [...stack, pagination.nextCursor]);
              setSelectedIds([]);
            }}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DocumentPreviewDrawer
        open={!!preview}
        url={preview?.url}
        fileName={preview?.fileName}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
