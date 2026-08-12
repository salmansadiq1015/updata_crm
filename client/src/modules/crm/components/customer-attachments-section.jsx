'use client';

import { useEffect, useRef, useState } from 'react';
import { useAttachmentMutations } from '@/modules/crm/hooks/use-customer-attachments';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Download, Loader2, Paperclip, Pencil, Trash2, Upload, X, File, FileText, Image as ImageIcon } from 'lucide-react';
import { ATTACHMENT_ACCEPT, AttachmentUploadButton, fileTypeIcon, fmtBytes, uploaderInitials } from './customer-file-utils';

export function CustomerAttachmentsSection({ customerId, attachments, canWrite, de }) {
  const { upload, rename, remove, bulkRemove, download } = useAttachmentMutations(customerId);
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [selected, setSelected] = useState(new Set());
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const handleFileInput = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    await Promise.allSettled(files.map((f) => upload.mutateAsync(f)));
    e.target.value = '';
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!canWrite) return;
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    await Promise.allSettled(files.map((f) => upload.mutateAsync(f)));
  };

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Prune selection when the attachment list changes (e.g. after delete/upload refresh)
  useEffect(() => {
    setSelected((prev) => {
      const currentIds = new Set(attachments.map((f) => f._id));
      const pruned = new Set([...prev].filter((id) => currentIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [attachments]);

  const toggleAll = () =>
    setSelected(selected.size === attachments.length ? new Set() : new Set(attachments.map((f) => f._id)));

  const openRename = (file) => {
    setRenameTarget({ id: file._id });
    setRenameName(file.originalName ?? '');
  };

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    await rename.mutateAsync({ fileId: renameTarget.id, originalName: renameName.trim() });
    setRenameTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await remove.mutateAsync(deleteTarget);
    setDeleteTarget(null);
    setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget); return n; });
  };

  const handleBulkDelete = async () => {
    await bulkRemove.mutateAsync(Array.from(selected));
    setSelected(new Set());
    setBulkDeleteOpen(false);
  };

  const fmtDate = (d) => d
    ? new Intl.DateTimeFormat(de ? 'de-CH' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
    : '—';

  const allSelected = attachments.length > 0 && selected.size === attachments.length;

  return (
    <div
      className={cn(
        'mt-5 rounded-xl transition-colors',
        isDragOver && 'ring-2 ring-brand-500/40 bg-brand-500/5',
      )}
      onDrop={canWrite ? handleDrop : undefined}
      onDragOver={canWrite ? (e) => { e.preventDefault(); setIsDragOver(true); } : undefined}
      onDragLeave={canWrite ? () => setIsDragOver(false) : undefined}
    >
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          {de ? 'Anhänge' : 'Attachments'}
        </p>
        {canWrite && (
          <>
            <AttachmentUploadButton
              compact
              onClick={() => fileInputRef.current?.click()}
              isPending={upload.isPending}
              de={de}
            />
            <input ref={fileInputRef} type="file" multiple className="hidden" accept={ATTACHMENT_ACCEPT} onChange={handleFileInput} />
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title={de ? 'Keine Anhänge' : 'No attachments'}
          description={de
            ? 'Lade Dokumente, Pläne oder Fotos zu diesem Kunden hoch.'
            : 'Upload documents, plans or photos for this customer.'}
          className="py-8"
          action={canWrite ? (
            <AttachmentUploadButton
              onClick={() => fileInputRef.current?.click()}
              isPending={upload.isPending}
              de={de}
            />
          ) : undefined}
        />
      ) : (
        <>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            {/* Table header */}
            <div className="grid grid-cols-[1.5rem_1fr_5rem_6rem_1.75rem_5rem] items-center bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 gap-2">
              {canWrite
                ? <Checkbox checked={allSelected} onCheckedChange={toggleAll} className="border-border data-[state=checked]:bg-muted data-[state=checked]:border-border0" />
                : <span />}
              <div>{de ? 'Name' : 'Name'}</div>
              <div>{de ? 'Grösse' : 'Size'}</div>
              <div>{de ? 'Datum' : 'Date'}</div>
              <div>{de ? 'Von' : 'By'}</div>
              <div />
            </div>

            {/* File rows */}
            {attachments.map((file) => {
              const { Icon, color } = fileTypeIcon(file.mimeType);
              const isSelected = selected.has(file._id);
              return (
                <div
                  key={file._id}
                  className={cn(
                    'grid grid-cols-[1.5rem_1fr_5rem_6rem_1.75rem_5rem] items-center border-b border-border last:border-0 px-3 py-2.5 gap-2 transition-colors',
                    isSelected ? 'bg-muted/60' : 'hover:bg-muted/40',
                  )}
                >
                  {canWrite
                    ? <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(file._id)} className="border-border data-[state=checked]:bg-muted data-[state=checked]:border-border0" />
                    : <span />}
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
                    <span className="text-[13px] text-foreground truncate">{file.originalName}</span>
                  </div>
                  <div className="text-[12px] text-muted-foreground">{fmtBytes(file.sizeBytes)}</div>
                  <div className="text-[12px] text-muted-foreground">{fmtDate(file.createdAt)}</div>
                  <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold text-muted-foreground shrink-0 select-none">
                    {uploaderInitials(file.uploadedBy)}
                  </div>
                  <div className="flex items-center gap-0.5 justify-end">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/60 hover:text-foreground" onClick={() => download.mutate({ fileId: file._id, fileName: file.originalName })} title={de ? 'Herunterladen' : 'Download'}>
                      <Download className="h-3 w-3" />
                    </Button>
                    {canWrite && (
                      <>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/60 hover:text-foreground" onClick={() => openRename(file)} title={de ? 'Umbenennen' : 'Rename'}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/60 hover:text-red-400" onClick={() => setDeleteTarget(file._id)} title={de ? 'Löschen' : 'Delete'}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bulk delete bar */}
          {selected.size > 0 && (
            <div className="mt-2 flex items-center gap-2 bg-muted/60 border border-border rounded-lg px-3 py-2">
              <span className="text-[12px] text-muted-foreground flex-1">
                {selected.size} {de ? 'ausgewählt' : 'selected'}
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-400/10 gap-1.5" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-3 w-3" />
                {de ? 'Löschen' : 'Delete selected'}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/80 hover:text-foreground" onClick={() => setSelected(new Set())}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) setRenameTarget(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{de ? 'Datei umbenennen' : 'Rename File'}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button onClick={handleRename} disabled={rename.isPending || !renameName.trim()}>
              {rename.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {de ? 'Speichern' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={de ? 'Datei löschen?' : 'Delete File?'}
        description={de ? 'Diese Aktion kann nicht rückgängig gemacht werden.' : 'This cannot be undone.'}
        onConfirm={handleDelete}
        loading={remove.isPending}
        confirmText={de ? 'Löschen' : 'Delete'}
        cancelText={de ? 'Abbrechen' : 'Cancel'}
        variant="destructive"
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={de ? `${selected.size} Dateien löschen?` : `Delete ${selected.size} files?`}
        description={de ? 'Diese Aktion kann nicht rückgängig gemacht werden.' : 'This cannot be undone.'}
        onConfirm={handleBulkDelete}
        loading={bulkRemove.isPending}
        confirmText={de ? 'Löschen' : 'Delete'}
        cancelText={de ? 'Abbrechen' : 'Cancel'}
        variant="destructive"
      />
    </div>
  );
}
