'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import {
  FileText,
  Download,
  Eye,
  FileImage,
  File,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useNetworkStatus } from '@/modules/mobile/hooks/use-network-status';
import { useOrderDocuments, useDocumentDownload } from '@/modules/mobile/hooks/use-document-queries';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { downloadFromUrl } from '@/lib/api/download';
import toast from 'react-hot-toast';

const FILE_ICONS = {
  pdf: FileText,
  jpg: FileImage,
  jpeg: FileImage,
  png: FileImage,
  gif: FileImage,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
};

function getFileIcon(filename) {
  const ext = filename?.split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || File;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { id: orderId } = useParams();
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const isOnline = useNetworkStatus();
  const isOffline = !isOnline;
  const [viewingDoc, setViewingDoc] = useState(null);

  const { data: documents, isLoading } = useOrderDocuments(orderId);
  const downloadMutation = useDocumentDownload();

  const docs = Array.isArray(documents) ? documents : documents?.items || [];

  const handleDownload = async (doc) => {
    if (!isOnline) {
      toast.error(lang === 'de' ? 'Download nur online möglich' : 'Download requires internet');
      return;
    }
    try {
      const result = await downloadMutation.mutateAsync({ orderId, docId: doc.id });
      const url = result?.url || result;
      if (url) {
        await downloadFromUrl(url, doc.filename || doc.name || 'download');
      }
    } catch {
      toast.error(lang === 'de' ? 'Download fehlgeschlagen' : 'Download failed');
    }
  };

  const handlePreview = (doc) => {
    const ext = doc.filename?.split('.').pop()?.toLowerCase();
    const previewable = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (previewable.includes(ext) && doc.url) {
      setViewingDoc(doc);
    } else {
      handleDownload(doc);
    }
  };

  if (isLoading) return <DocumentsSkeleton />;

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={t('mobile.order.documents', 'Dokumente')}
        showBack
        right={
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-lg">
            {docs.length}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {docs.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              variant={isOffline ? 'offline' : 'empty'}
              title={lang === 'de' ? 'Keine Dokumente' : 'No documents'}
              description={
                isOffline
                  ? (lang === 'de' ? 'Dokumente sind nur online verfügbar' : 'Documents are only available online')
                  : (lang === 'de' ? 'Diesem Auftrag sind keine Dokumente zugeordnet.' : 'No documents assigned to this order.')
              }
            />
          </div>
        ) : (
          <div className="px-4 py-4 space-y-2">
            {docs.map((doc) => {
              const Icon = getFileIcon(doc.filename || doc.name);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl"
                >
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted shrink-0">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.filename || doc.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                      {doc.uploaded_at && (
                        <span>
                          {new Date(doc.uploaded_at).toLocaleDateString(lang === 'de' ? 'de-CH' : 'en-GB')}
                        </span>
                      )}
                      {doc.category && <span>{doc.category}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 w-11 p-0"
                      onClick={() => handlePreview(doc)}
                      aria-label="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 w-11 p-0"
                      onClick={() => handleDownload(doc)}
                      disabled={!isOnline}
                      aria-label="Download"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewingDoc && (
        <DocumentPreview doc={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
}

function DocumentPreview({ doc, onClose }) {
  const ext = doc.filename?.split('.').pop()?.toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm text-white truncate flex-1 mr-4">{doc.filename || doc.name}</p>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/10" aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {isImage ? (
          <div className="relative min-h-full w-full">
            <Image
              src={doc.url}
              alt={doc.filename || doc.name || 'Document preview'}
              fill
              sizes="100vw"
              className="object-contain"
              unoptimized
            />
          </div>
        ) : ext === 'pdf' && doc.url ? (
          <iframe
            src={doc.url}
            className="w-full h-full"
            title={doc.filename}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-white/50 text-sm">Preview not available</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentsSkeleton() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="h-14 border-b border-border animate-pulse bg-muted/30" />
      <div className="px-4 py-4 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
