'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Download, ExternalLink, X, ZoomIn, ZoomOut, RotateCw,
  FileText, File, Image as ImageIcon, FileSpreadsheet, FileArchive,
  Maximize2,
} from 'lucide-react';

function getFileIcon(mimeType) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return FileSpreadsheet;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('7z')) return FileArchive;
  if (mimeType.includes('pdf') || mimeType.includes('text') || mimeType.includes('document') || mimeType.includes('word')) return FileText;
  return File;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function isPreviewable(mimeType) {
  if (!mimeType) return false;
  return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

function ImagePreview({ url }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  return (
    <div className="relative flex-1 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-xl overflow-hidden min-h-[400px]">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg border border-border/60 p-1 shadow-sm">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRotation((r) => r + 90)}>
          <RotateCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <img
        src={url}
        alt="Preview"
        className="max-w-full max-h-[70vh] object-contain transition-transform duration-200"
        style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
        draggable={false}
      />
    </div>
  );
}

function PdfPreview({ url }) {
  return (
    <div className="flex-1 rounded-xl overflow-hidden border border-border/40 min-h-[500px]">
      <iframe
        src={`${url}#toolbar=1&view=FitH`}
        className="w-full h-full min-h-[500px]"
        title="PDF Preview"
      />
    </div>
  );
}

function FallbackPreview({ doc }) {
  const FileIcon = getFileIcon(doc?.mimeType);

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 bg-muted/30 rounded-xl min-h-[300px]">
      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-5 shadow-sm">
        <FileIcon className="h-10 w-10 text-muted-foreground/60" />
      </div>
      <p className="text-sm font-medium text-foreground/80 mb-1">{doc?.originalName || doc?.fileName}</p>
      {doc?.fileSize && (
        <p className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</p>
      )}
      <p className="text-xs text-muted-foreground/60 mt-3">Preview not available for this file type</p>
    </div>
  );
}

export function DocumentViewer({ open, onOpenChange, doc, url }) {
  if (!doc) return null;

  const canPreview = isPreviewable(doc.mimeType);
  const isImage = doc.mimeType?.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden',
          canPreview ? 'sm:max-w-5xl' : 'sm:max-w-lg',
        )}
        hideClose
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              {(() => { const Icon = getFileIcon(doc.mimeType); return <Icon className="h-4.5 w-4.5 text-primary" />; })()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{doc.originalName || doc.fileName}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {doc.fileSize && <span>{formatFileSize(doc.fileSize)}</span>}
                {doc.mimeType && <span className="truncate">{doc.mimeType}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {url && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a href={url} download={doc.originalName || doc.fileName}>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(url, '_blank')}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-4">
          {isImage && url && <ImagePreview url={url} />}
          {isPdf && url && <PdfPreview url={url} />}
          {(!canPreview || !url) && <FallbackPreview doc={doc} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { getFileIcon, formatFileSize, isPreviewable };
