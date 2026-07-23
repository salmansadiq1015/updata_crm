'use client';

import { cn } from '@/lib/utils';
import { Loader2, Upload, File, FileText, Image as ImageIcon } from 'lucide-react';

export const ATTACHMENT_ACCEPT = [
  'image/*',
  '.pdf', 'application/pdf',
  '.doc', '.docx', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls', '.xlsx', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv', 'text/csv', '.txt', 'text/plain',
].join(',');

// ─── helpers ─────────────────────────────────────────────────────────────────
export function fmtBytes(n) {
  const bytes = n ?? 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function fileTypeIcon(mimeType) {
  if (!mimeType) return { Icon: File, color: 'text-muted-foreground/80' };
  if (mimeType.startsWith('image/')) return { Icon: ImageIcon, color: 'text-blue-400' };
  if (mimeType === 'application/pdf') return { Icon: FileText, color: 'text-red-400' };
  if (mimeType.includes('document') || mimeType.includes('word')) return { Icon: FileText, color: 'text-blue-400' };
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType === 'text/csv') return { Icon: FileText, color: 'text-green-400' };
  return { Icon: File, color: 'text-muted-foreground' };
}

export function uploaderInitials(uploadedBy) {
  if (!uploadedBy) return '?';
  return `${uploadedBy.firstName?.[0] ?? ''}${uploadedBy.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function AttachmentUploadButton({ onClick, isPending, de, compact = false }) {
  const label = de
    ? (compact ? 'Hochladen' : 'Datei hochladen')
    : 'Upload File';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className={cn(
        'group relative inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none',
        compact ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-4 text-[12px]',
        'bg-gradient-to-r from-violet-600/25 via-violet-500/15 to-teal-500/10',
        'border border-violet-500/30 hover:border-violet-400/45',
        'text-violet-700 hover:text-foreground dark:text-violet-200',
        'shadow-[0_0_14px_-4px_rgba(139,92,246,0.35)]',
        'hover:shadow-[0_0_22px_-4px_rgba(139,92,246,0.55)]',
        'hover:from-violet-600/35 hover:to-teal-500/15',
        'active:scale-[0.98]',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-md bg-violet-500/20 transition-colors group-hover:bg-violet-500/30',
          compact ? 'h-5 w-5' : 'h-6 w-6',
        )}
      >
        {isPending
          ? <Loader2 className="h-3 w-3 animate-spin text-violet-300" />
          : <Upload className="h-3 w-3 text-violet-300 transition-colors group-hover:text-violet-100" />}
      </span>
      {label}
    </button>
  );
}
