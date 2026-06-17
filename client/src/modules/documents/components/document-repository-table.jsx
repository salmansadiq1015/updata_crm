'use client';

import { AlertTriangle, Download, Eye, FileText, FolderOpen, Link2, Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  describeDocumentLinks,
  formatDocumentDate,
  formatFileSize,
  SOURCE_BADGE_CLASS,
} from '../utils/document-formatters';

function LoadingRows() {
  return Array.from({ length: 7 }).map((_, index) => (
    <TableRow key={index}>
      <TableCell className="min-w-[280px]">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="ml-auto h-8 w-28" /></TableCell>
    </TableRow>
  ));
}

function LinkSummary({ doc, t }) {
  const links = describeDocumentLinks(doc);
  if (!links.length) {
    return <span className="text-xs text-muted-foreground">{t('documents.repository.unlinked')}</span>;
  }

  return (
    <div className="flex max-w-[240px] flex-wrap gap-1.5">
      {links.slice(0, 3).map((link) => (
        <Badge key={`${link.label}-${link.value}`} variant="outline" className="max-w-full gap-1 border-border text-[11px] font-normal">
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{t(link.labelKey, link.type)}: {link.value.slice(-8)}</span>
        </Badge>
      ))}
      {links.length > 3 && <Badge variant="secondary" className="text-[11px]">+{links.length - 3}</Badge>}
    </div>
  );
}

export function DocumentRepositoryTable({
  documents = [],
  loading = false,
  error = null,
  onPreview,
  onDownload,
  onDelete,
  busyId,
  canDelete = false,
}) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === 'en' ? 'en' : `${locale}-CH`;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" />
          {t('documents.repository.loadFailed')}
        </div>
        <p className="mt-1 text-xs text-destructive/80">{error?.message || t('documents.repository.tryRefresh')}</p>
      </div>
    );
  }

  if (!loading && !documents.length) {
    return (
      <div className="rounded-lg border border-dashed bg-background px-6 py-14 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">{t('documents.repository.emptyTitle')}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t('documents.repository.emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="min-w-[300px] px-4">{t('documents.repository.document')}</TableHead>
            <TableHead className="w-[140px]">{t('documents.repository.source')}</TableHead>
            <TableHead className="w-[160px]">{t('documents.repository.type')}</TableHead>
            <TableHead className="min-w-[220px]">{t('documents.repository.links')}</TableHead>
            <TableHead className="w-[150px]">{t('documents.repository.date')}</TableHead>
            <TableHead className="w-[92px] text-right">{t('documents.repository.size')}</TableHead>
            <TableHead className="w-[132px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <LoadingRows />
          ) : (
            documents.map((doc) => {
              const title = doc.title || doc.fileName || t('documents.repository.untitled');
              const actionBusy = busyId === doc.id;
              return (
                <TableRow key={doc.id}>
                  <TableCell className="px-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{title}</div>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{doc.fileName || title}</span>
                          {doc.folderPath && (
                            <span className="hidden max-w-[220px] truncate sm:inline">/{doc.folderPath}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', SOURCE_BADGE_CLASS[doc.source])}>
                      {t(`documents.repository.source.${doc.source}`, doc.sourceLabel || doc.source)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[150px] truncate text-sm">{doc.documentType || doc.category || '-'}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{doc.origin ? t(`documents.repository.origin.${doc.origin}`, doc.origin) : '-'}</div>
                  </TableCell>
                  <TableCell>
                    <LinkSummary doc={doc} t={t} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDocumentDate(doc.createdAt, dateLocale)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatFileSize(doc.fileSizeBytes)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t('common.preview')}
                        onClick={() => onPreview?.(doc)}
                        disabled={actionBusy}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t('common.download')}
                        onClick={() => onDownload?.(doc)}
                        disabled={actionBusy}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canDelete && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title={doc.canDelete === false ? t('documents.repository.deleteBlocked') : t('common.delete')}
                          onClick={() => onDelete?.(doc)}
                          disabled={actionBusy || doc.canDelete === false}
                        >
                          {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
