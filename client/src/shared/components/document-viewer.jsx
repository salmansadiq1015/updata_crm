'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Download, ExternalLink, X, ZoomIn, ZoomOut, RotateCw, RotateCcw,
  FileText, File, Image as ImageIcon, FileSpreadsheet, FileArchive,
  Maximize2, Minimize2, ChevronLeft, ChevronRight, Printer,
  Copy, Check, Move, FileVideo, FileAudio, FileCode,
  FlipHorizontal2, RefreshCw,
} from 'lucide-react';

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

function getFileIcon(mimeType) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType.startsWith('audio/')) return FileAudio;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return FileSpreadsheet;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('7z')) return FileArchive;
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('xml') || mimeType.includes('html') || mimeType.includes('css')) return FileCode;
  if (mimeType.includes('pdf') || mimeType.includes('text') || mimeType.includes('document') || mimeType.includes('word')) return FileText;
  return File;
}

function getFileColor(mimeType) {
  if (!mimeType) return 'text-muted-foreground';
  if (mimeType.startsWith('image/')) return 'text-violet-400';
  if (mimeType.startsWith('video/')) return 'text-pink-400';
  if (mimeType.startsWith('audio/')) return 'text-amber-400';
  if (mimeType.includes('pdf')) return 'text-red-400';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'text-emerald-400';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'text-orange-400';
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('xml')) return 'text-sky-400';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-400';
  return 'text-muted-foreground';
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function isPreviewable(mimeType) {
  if (!mimeType) return false;
  return (
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('javascript') ||
    mimeType.includes('css') ||
    mimeType.includes('html')
  );
}

function getFileExtension(name) {
  if (!name) return '';
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toUpperCase() : '';
}

// ── Toolbar button ──────────────────────────────────────────

function ToolbarBtn({ icon: Icon, label, onClick, disabled, active, className, shortcut }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-150',
              'text-white/70 hover:text-white hover:bg-white/10',
              'disabled:opacity-30 disabled:pointer-events-none',
              active && 'bg-white/15 text-white',
              className,
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {label}{shortcut && <span className="ml-1.5 text-muted-foreground">{shortcut}</span>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-white/10 mx-0.5" />;
}

// ── Image preview with pan & zoom ───────────────────────────

function ImagePreview({ url, zoom, rotation, flipH, onZoomChange }) {
  const containerRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setLoaded(false);
  }, [url]);

  useEffect(() => {
    if (zoom === 1 && rotation % 360 === 0) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom, rotation]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));
    onZoomChange(newZoom);
  }, [zoom, onZoomChange]);

  const handleMouseDown = useCallback((e) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  const handleDoubleClick = useCallback(() => {
    if (zoom === 1) {
      onZoomChange(2);
    } else {
      onZoomChange(1);
      setPan({ x: 0, y: 0 });
    }
  }, [zoom, onZoomChange]);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex items-center justify-center overflow-hidden relative select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

      <img
        src={url}
        alt="Preview"
        className={cn(
          'max-w-full max-h-full object-contain transition-[opacity] duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
          transformOrigin: 'center center',
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
        draggable={false}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

// ── PDF preview ─────────────────────────────────────────────

function PdfPreview({ url }) {
  return (
    <div className="flex-1 overflow-hidden">
      <iframe
        src={`${url}#toolbar=1&view=FitH`}
        className="w-full h-full border-0"
        title="PDF Preview"
      />
    </div>
  );
}

// ── Video preview ───────────────────────────────────────────

function VideoPreview({ url, mimeType }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <video
        src={url}
        controls
        autoPlay
        className="max-w-full max-h-full rounded-lg shadow-2xl"
        style={{ maxHeight: 'calc(100vh - 140px)' }}
      >
        <source src={url} type={mimeType} />
      </video>
    </div>
  );
}

// ── Audio preview ───────────────────────────────────────────

function AudioPreview({ url, mimeType, doc }) {
  const FileIcon = getFileIcon(mimeType);
  const color = getFileColor(mimeType);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
      <div className="relative">
        <div className="h-32 w-32 rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center ring-1 ring-white/10">
          <FileIcon className={cn('h-16 w-16', color)} />
        </div>
        <div className="absolute -inset-4 rounded-[2rem] border border-white/[0.06] animate-pulse" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-white/90">{doc?.originalName || doc?.fileName}</p>
      </div>
      <audio controls autoPlay className="w-full max-w-md">
        <source src={url} type={mimeType} />
      </audio>
    </div>
  );
}

// ── Text/code preview ───────────────────────────────────────

function TextPreview({ url }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setContent(null);
    setError(false);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then(setContent)
      .catch(() => setError(true));
  }, [url]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/50 text-sm">
        Failed to load file content
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <pre className="text-[13px] leading-relaxed text-white/80 font-mono whitespace-pre-wrap break-words">
        {content}
      </pre>
    </div>
  );
}

// ── Fallback preview ────────────────────────────────────────

function FallbackPreview({ doc }) {
  const FileIcon = getFileIcon(doc?.mimeType);
  const color = getFileColor(doc?.mimeType);
  const ext = getFileExtension(doc?.originalName || doc?.fileName);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="relative">
        <div className="h-28 w-28 rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] flex items-center justify-center ring-1 ring-white/10">
          <FileIcon className={cn('h-14 w-14', color)} />
        </div>
        {ext && (
          <div className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-sm text-[10px] font-bold text-white/70 uppercase tracking-wider ring-1 ring-white/10">
            {ext}
          </div>
        )}
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-sm font-medium text-white/90">{doc?.originalName || doc?.fileName}</p>
        <div className="flex items-center justify-center gap-3 text-xs text-white/40">
          {doc?.fileSize > 0 && <span>{formatFileSize(doc.fileSize)}</span>}
          {doc?.mimeType && <span>{doc.mimeType}</span>}
        </div>
      </div>
      <p className="text-xs text-white/30">No preview available — download to view</p>
    </div>
  );
}

// ── Main viewer ─────────────────────────────────────────────

export function DocumentViewer({ open, onOpenChange, doc, url, docs, onNavigate }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef(null);

  const hasNav = docs && docs.length > 1 && onNavigate;
  const currentIndex = hasNav ? docs.findIndex((d) => d._id === doc?._id) : -1;
  const canPrev = hasNav && currentIndex > 0;
  const canNext = hasNav && currentIndex < docs.length - 1;

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setFlipH(false);
  }, []);

  useEffect(() => {
    resetView();
  }, [doc?._id, resetView]);

  const isImage = doc?.mimeType?.startsWith('image/');
  const isPdf = doc?.mimeType === 'application/pdf';
  const isVideo = doc?.mimeType?.startsWith('video/');
  const isAudio = doc?.mimeType?.startsWith('audio/');
  const isText = doc?.mimeType?.startsWith('text/') ||
    doc?.mimeType?.includes('json') || doc?.mimeType?.includes('xml') ||
    doc?.mimeType?.includes('javascript') || doc?.mimeType?.includes('css') ||
    doc?.mimeType?.includes('html');
  const canPreview = isPreviewable(doc?.mimeType);

  const navigatePrev = useCallback(() => {
    if (canPrev) onNavigate(docs[currentIndex - 1]);
  }, [canPrev, docs, currentIndex, onNavigate]);

  const navigateNext = useCallback(() => {
    if (canNext) onNavigate(docs[currentIndex + 1]);
  }, [canNext, docs, currentIndex, onNavigate]);

  const stepZoom = useCallback((direction) => {
    setZoom((prev) => {
      const idx = ZOOM_STEPS.findIndex((s) => s >= prev);
      const nextIdx = direction > 0
        ? Math.min(ZOOM_STEPS.length - 1, (idx >= 0 ? idx : 0) + 1)
        : Math.max(0, (idx > 0 ? idx : 1) - 1);
      return ZOOM_STEPS[nextIdx];
    });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.closest('[data-slot="dialog-content"]')?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // fullscreen not supported
    }
  }, []);

  const handlePrint = useCallback(() => {
    if (!url) return;
    const w = window.open(url, '_blank');
    if (w) {
      w.addEventListener('load', () => { w.print(); });
    }
  }, [url]);

  const handleCopyName = useCallback(async () => {
    const name = doc?.originalName || doc?.fileName;
    if (!name) return;
    try {
      await navigator.clipboard.writeText(name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  }, [doc]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      switch (e.key) {
        case 'Escape':
          onOpenChange(false);
          break;
        case 'ArrowLeft':
          if (hasNav) { e.preventDefault(); navigatePrev(); }
          break;
        case 'ArrowRight':
          if (hasNav) { e.preventDefault(); navigateNext(); }
          break;
        case '+':
        case '=':
          if (isImage) { e.preventDefault(); stepZoom(1); }
          break;
        case '-':
          if (isImage) { e.preventDefault(); stepZoom(-1); }
          break;
        case '0':
          if (isImage) { e.preventDefault(); resetView(); }
          break;
        case 'r':
        case 'R':
          if (isImage) { e.preventDefault(); setRotation((r) => r + 90); }
          break;
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, hasNav, isImage, navigatePrev, navigateNext, stepZoom, resetView, toggleFullscreen, onOpenChange]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (!doc) return null;

  const FileIcon = getFileIcon(doc.mimeType);
  const fileColor = getFileColor(doc.mimeType);
  const ext = getFileExtension(doc.originalName || doc.fileName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={containerRef}
        className={cn(
          'p-0 gap-0 overflow-hidden border-white/[0.06] bg-[#0c0c0f]/[0.98] text-white backdrop-blur-2xl',
          'sm:max-w-6xl w-[calc(100vw-2rem)] max-h-[97vh]',
          'flex flex-col',
          'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98]',
        )}
        hideClose
      >
        <VisuallyHidden.Root>
          <DialogTitle>{doc.originalName || doc.fileName || 'Document preview'}</DialogTitle>
        </VisuallyHidden.Root>

        {/* ── Top toolbar ───────────────────────────────────── */}
        <div className="flex items-center justify-between h-12 px-3 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
          {/* Left: file info */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={cn('h-7 w-7 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0')}>
              <FileIcon className={cn('h-3.5 w-3.5', fileColor)} />
            </div>
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-[13px] font-medium text-white/90 truncate max-w-[300px]">
                {doc.originalName || doc.fileName}
              </span>
              {ext && (
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider bg-white/[0.05] px-1.5 py-0.5 rounded shrink-0">
                  {ext}
                </span>
              )}
              {doc.fileSize > 0 && (
                <span className="text-[11px] text-white/30 tabular-nums shrink-0">
                  {formatFileSize(doc.fileSize)}
                </span>
              )}
            </div>
          </div>

          {/* Center: image controls */}
          {isImage && (
            <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg px-1 py-0.5 ring-1 ring-white/[0.06]">
              <ToolbarBtn icon={ZoomOut} label="Zoom out" shortcut="−" onClick={() => stepZoom(-1)} disabled={zoom <= MIN_ZOOM} />
              <button
                onClick={resetView}
                className="h-8 min-w-[52px] flex items-center justify-center rounded-md text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/10 tabular-nums transition-colors"
              >
                {Math.round(zoom * 100)}%
              </button>
              <ToolbarBtn icon={ZoomIn} label="Zoom in" shortcut="+" onClick={() => stepZoom(1)} disabled={zoom >= MAX_ZOOM} />

              <ToolbarDivider />

              <ToolbarBtn icon={RotateCcw} label="Rotate left" onClick={() => setRotation((r) => r - 90)} />
              <ToolbarBtn icon={RotateCw} label="Rotate right" shortcut="R" onClick={() => setRotation((r) => r + 90)} />

              <ToolbarDivider />

              <ToolbarBtn icon={FlipHorizontal2} label="Flip" onClick={() => setFlipH((f) => !f)} active={flipH} />
              <ToolbarBtn icon={RefreshCw} label="Reset" shortcut="0" onClick={resetView} />
            </div>
          )}

          {/* Right: actions */}
          <div className="flex items-center gap-0.5 shrink-0 ml-2">
            <ToolbarBtn icon={copied ? Check : Copy} label="Copy name" onClick={handleCopyName} />
            <ToolbarBtn icon={Printer} label="Print" onClick={handlePrint} disabled={!url} />
            {url && (
              <>
                <ToolbarBtn
                  icon={Download}
                  label="Download"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = doc.originalName || doc.fileName || 'download';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                />
                <ToolbarBtn icon={ExternalLink} label="Open in new tab" onClick={() => window.open(url, '_blank')} />
              </>
            )}
            <ToolbarDivider />
            <ToolbarBtn
              icon={isFullscreen ? Minimize2 : Maximize2}
              label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              shortcut="F"
              onClick={toggleFullscreen}
            />
            <ToolbarBtn
              icon={X}
              label="Close"
              shortcut="Esc"
              onClick={() => onOpenChange(false)}
              className="hover:bg-red-500/20 hover:text-red-400"
            />
          </div>
        </div>

        {/* ── Content area ──────────────────────────────────── */}
        <div className="flex-1 flex relative overflow-hidden min-h-0" style={{ minHeight: '400px' }}>
          {/* Nav: Previous */}
          {hasNav && (
            <button
              onClick={navigatePrev}
              disabled={!canPrev}
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-200',
                'bg-black/40 backdrop-blur-sm ring-1 ring-white/10',
                canPrev ? 'text-white/70 hover:text-white hover:bg-black/60 hover:ring-white/20' : 'text-white/20 pointer-events-none',
              )}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* Preview content */}
          {isImage && url && (
            <ImagePreview url={url} zoom={zoom} rotation={rotation} flipH={flipH} onZoomChange={setZoom} />
          )}
          {isPdf && url && <PdfPreview url={url} />}
          {isVideo && url && <VideoPreview url={url} mimeType={doc.mimeType} />}
          {isAudio && url && <AudioPreview url={url} mimeType={doc.mimeType} doc={doc} />}
          {isText && url && <TextPreview url={url} />}
          {(!canPreview || !url) && <FallbackPreview doc={doc} />}

          {/* Nav: Next */}
          {hasNav && (
            <button
              onClick={navigateNext}
              disabled={!canNext}
              className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-200',
                'bg-black/40 backdrop-blur-sm ring-1 ring-white/10',
                canNext ? 'text-white/70 hover:text-white hover:bg-black/60 hover:ring-white/20' : 'text-white/20 pointer-events-none',
              )}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* ── Bottom bar ────────────────────────────────────── */}
        {hasNav && (
          <div className="flex items-center justify-center h-9 border-t border-white/[0.06] bg-white/[0.02] shrink-0">
            <span className="text-[11px] text-white/40 tabular-nums">
              {currentIndex + 1} / {docs.length}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { getFileIcon, formatFileSize, isPreviewable };
