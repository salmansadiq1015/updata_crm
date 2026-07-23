'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, File, FileImage, FileText, FileVideo, Loader2, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TaskAttachment } from '../types/task-types';
import { taskApi } from '../services/task-api';

type FileViewerProps = {
  attachments: TaskAttachment[];
  isLoading?: boolean;
  isUploading?: boolean;
  onUpload: (file: File) => void;
  onDelete: (attachmentId: string) => void;
};

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${bytes} B`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('spreadsheetml') ||
    mimeType.includes('presentationml')
  )
    return FileText;
  return File;
}

function isImage(mimeType: string) {
  return mimeType.startsWith('image/');
}
function isPdf(mimeType: string) {
  return mimeType === 'application/pdf';
}
function isOffice(mimeType: string) {
  return (
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('spreadsheetml') ||
    mimeType.includes('presentationml')
  );
}
function isVideo(mimeType: string) {
  return mimeType.startsWith('video/');
}
function isText(mimeType: string) {
  return mimeType.startsWith('text/');
}

/**
 * Resolves a presigned S3 download URL for a task attachment via an
 * authenticated API call. The raw API download endpoint requires a JWT
 * which browsers don't send for <img src>, <embed src>, etc.
 */
function useResolvedUrl(taskId: string, attachmentId: string) {
  return useQuery({
    queryKey: ['tasks', taskId, 'attachments', attachmentId, 'downloadUrl'],
    queryFn: () => taskApi.getAttachmentDownloadUrl(taskId, attachmentId),
    staleTime: 4 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

function FilePreview({ attachment }: { attachment: TaskAttachment }) {
  const { t } = useLanguage();
  const [zoom, setZoom] = useState(1);
  const { mimeType, fileName, taskId, id } = attachment;
  const { data: resolvedUrl, isLoading: isResolvingUrl } = useResolvedUrl(taskId, id);

  if (isResolvingUrl || !resolvedUrl) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin opacity-40" />
        <p className="text-sm">{t('tasks.files.loadingPreview', 'Vorschau wird geladen…')}</p>
      </div>
    );
  }

  if (isImage(mimeType)) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center gap-2 px-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
          >
            <ZoomOut className="h-3.5 w-3.5" /> -
          </Button>
          <span className="text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          >
            <ZoomIn className="h-3.5 w-3.5" /> +
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 gap-1 text-xs"
            onClick={() => setZoom(1)}
          >
            Reset
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-checkerboard">
          <img
            src={resolvedUrl}
            alt={fileName}
            className="mx-auto block transition-transform"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          />
        </div>
      </div>
    );
  }

  if (isPdf(mimeType)) {
    return (
      <embed
        src={resolvedUrl}
        type="application/pdf"
        className="min-h-0 flex-1 rounded-lg"
        width="100%"
        height="100%"
      />
    );
  }

  if (isOffice(mimeType)) {
    const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(resolvedUrl)}`;
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="px-1 text-xs text-muted-foreground">
          Note: Office Online viewer requires a publicly accessible URL.
        </p>
        <iframe
          src={viewerUrl}
          className="min-h-0 flex-1 rounded-lg border border-border"
          title={fileName}
          allow="fullscreen"
        />
      </div>
    );
  }

  if (isVideo(mimeType)) {
    return (
      <video
        src={resolvedUrl}
        controls
        className="min-h-0 flex-1 rounded-lg bg-black"
        style={{ maxHeight: '100%', width: '100%' }}
      />
    );
  }

  if (isText(mimeType)) {
    return (
      <iframe
        src={resolvedUrl}
        className="min-h-0 flex-1 rounded-lg border border-border font-mono text-sm"
        title={fileName}
      />
    );
  }

  // Fallback: download
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
      <FileText className="h-16 w-16 opacity-40" />
      <p className="text-sm">{t('tasks.files.noPreview', 'Dieser Dateityp kann nicht angezeigt werden.')}</p>
      <a href={resolvedUrl} download={fileName} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Download file
        </Button>
      </a>
    </div>
  );
}

function DownloadButton({ attachment }: { attachment: TaskAttachment }) {
  const { data: resolvedUrl } = useResolvedUrl(attachment.taskId, attachment.id);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (resolvedUrl) {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={handleClick}
      disabled={!resolvedUrl}
    >
      <Download className="h-3.5 w-3.5" /> Download
    </Button>
  );
}

export function TaskFileViewer({
  attachments,
  isLoading,
  isUploading,
  onUpload,
  onDelete,
}: FileViewerProps) {
  const { t } = useLanguage();
  const [viewingAttachment, setViewingAttachment] = useState<TaskAttachment | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = '';
    }
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      onDelete(id);
      setConfirmDeleteId(null);
      if (viewingAttachment?.id === id) setViewingAttachment(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('tasks.files.title', 'Anhänge')} {attachments.length > 0 && `(${attachments.length})`}
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {isUploading ? t('tasks.files.uploading', 'Wird hochgeladen…') : t('tasks.files.upload', 'Hochladen')}
        </Button>
        <input ref={fileInputRef} type="file" className="sr-only" onChange={handleFileChange} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('tasks.files.empty', 'Noch keine Anhänge.')}</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((att) => {
            const Icon = getFileIcon(att.mimeType);
            const isConfirmingDelete = confirmDeleteId === att.id;
            return (
              <div
                key={att.id}
                className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-muted/50"
                onClick={() => setViewingAttachment(att)}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{att.fileName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatSize(att.fileSize)}
                    {att.createdAt && (
                      <>
                        {' · '}
                        {new Date(att.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-all',
                    isConfirmingDelete
                      ? 'bg-destructive text-destructive-foreground opacity-100'
                      : 'text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100',
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(att.id);
                  }}
                  title={isConfirmingDelete ? t('tasks.files.confirmDelete', 'Zum Bestätigen erneut klicken') : t('tasks.files.delete', 'Anhang löschen')}
                >
                  {isConfirmingDelete ? 'Confirm?' : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!viewingAttachment} onOpenChange={(o) => !o && setViewingAttachment(null)}>
        <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              {viewingAttachment &&
                (() => {
                  const Icon = getFileIcon(viewingAttachment.mimeType);
                  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
                })()}
              <span className="truncate">{viewingAttachment?.fileName}</span>
              <span className="ml-auto shrink-0">
                {viewingAttachment && <DownloadButton attachment={viewingAttachment} />}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            {viewingAttachment && <FilePreview attachment={viewingAttachment} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
