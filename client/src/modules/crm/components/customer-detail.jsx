'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { customerService } from '@/modules/crm/services/customer-service';
import { useCustomerDocuments } from '@/modules/qop/hooks/use-qop-queries';
import { useCustomerAttachments, useAttachmentMutations } from '@/modules/crm/hooks/use-customer-attachments';
import { QuotationStatusBadge, OrderStatusBadge, InvoiceStatusBadge } from '@/modules/qop/components/status-badge';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useCustomerMutations } from '@/modules/crm/hooks/use-customer-mutations';
import { CustomerForm } from '@/modules/crm/components/customer-form';
import { CustomerMergeDialog } from '@/modules/crm/components/customer-merge-dialog';
import { CustomerActivityPanel } from '@/modules/crm/components/customer-activity-panel';
import { ContactsPanel } from '@/modules/crm/components/contacts-panel';
import { SitesPanel } from '@/modules/crm/components/sites-panel';
import { ImagesPanel } from '@/modules/crm/components/images-panel';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { RichTextContent } from '@/components/ui/rich-text-content';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate, formatPhone } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Pencil, Archive, Building2, User, Mail, Phone, Globe, MapPin,
  ChevronRight, Copy, Hash, Calendar, BellRing, FileText,
  UsersIcon, ClipboardList, Activity, GitMerge,
  Upload, Download, Trash2, Loader2, X, ReceiptText,
  File, Image as ImageIcon, Paperclip,
} from 'lucide-react';
import { pickCustomerAccent, CH_CANTONS } from '@/modules/crm/constants/customer-constants';

const cantonName = (code) => CH_CANTONS.find((c) => c.code === code)?.name || code;

// Accepted attachment types — documents + images (scans/photos of contracts).
// Mirrors the server 'general' bucket policy (ALLOWED_MIME_TYPES.all minus audio/video).
const ATTACHMENT_ACCEPT = [
  'image/*',
  '.pdf', 'application/pdf',
  '.doc', '.docx', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls', '.xlsx', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv', 'text/csv', '.txt', 'text/plain',
].join(',');

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmtBytes(n) {
  const bytes = n ?? 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fileTypeIcon(mimeType) {
  if (!mimeType) return { Icon: File, color: 'text-white/30' };
  if (mimeType.startsWith('image/')) return { Icon: ImageIcon, color: 'text-blue-400' };
  if (mimeType === 'application/pdf') return { Icon: FileText, color: 'text-red-400' };
  if (mimeType.includes('document') || mimeType.includes('word')) return { Icon: FileText, color: 'text-blue-400' };
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType === 'text/csv') return { Icon: FileText, color: 'text-green-400' };
  return { Icon: File, color: 'text-white/40' };
}

function uploaderInitials(uploadedBy) {
  if (!uploadedBy) return '?';
  return `${uploadedBy.firstName?.[0] ?? ''}${uploadedBy.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

function AttachmentUploadButton({ onClick, isPending, de, compact = false }) {
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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F18]',
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none',
        compact ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-4 text-[12px]',
        'bg-gradient-to-r from-violet-600/25 via-violet-500/15 to-teal-500/10',
        'border border-violet-500/30 hover:border-violet-400/45',
        'text-violet-200 hover:text-white',
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

// ─── Animated empty state ─────────────────────────────────────────────────────
function DocumentsAnimatedEmpty({ customerId, de, canWrite }) {
  const fileInputRef = useRef(null);
  const { upload } = useAttachmentMutations(customerId);

  const handleFileInput = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    await Promise.allSettled(files.map((f) => upload.mutateAsync(f)));
    e.target.value = '';
  };

  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3">
      <style>{`@keyframes doc-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
      <div style={{ animation: 'doc-float 3s ease-in-out infinite' }} className="text-white/20">
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="14" width="42" height="32" rx="4" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
          <path d="M5 22h42" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
          <rect x="5" y="9" width="19" height="9" rx="2" fill="currentColor" fillOpacity="0.20" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
          <path d="M17 33h18M17 39h12" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-center space-y-1">
        <p className="text-[13px] font-medium text-white/50">
          {de ? 'Keine Dokumente vorhanden' : 'No documents yet'}
        </p>
        <p className="text-[12px] text-white/25">
          {de
            ? 'Dateien hochladen oder Offerte erstellen.'
            : 'Upload files or create a quotation to get started.'}
        </p>
      </div>
      {canWrite && (
        <>
          <AttachmentUploadButton
            onClick={() => fileInputRef.current?.click()}
            isPending={upload.isPending}
            de={de}
          />
          <input ref={fileInputRef} type="file" multiple className="hidden" accept={ATTACHMENT_ACCEPT} onChange={handleFileInput} />
        </>
      )}
    </div>
  );
}

// ─── Business Documents section ───────────────────────────────────────────────
function CustomerBusinessDocsSection({ docs, de }) {
  const fmtDate = (d) => d
    ? new Intl.DateTimeFormat(de ? 'de-CH' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
    : '—';
  const fmt = (n) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

  if (!docs.length) {
    return (
      <EmptyState
        icon={FileText}
        title={de ? 'Keine Geschäftsdokumente' : 'No business documents'}
        description={de
          ? 'Erstellte Offerten und Rechnungen erscheinen hier.'
          : 'Generated quotations and invoices will appear here.'}
        className="py-8"
      />
    );
  }

  return (
    <div className="rounded-xl border border-white/6 overflow-hidden bg-[#0B0F18] text-sm">
      <div className="grid grid-cols-[5rem_8rem_1fr_6rem_6rem] bg-white/3 border-b border-white/6 text-[11px] font-semibold uppercase tracking-wider text-white/35 px-3 py-2">
        <div>{de ? 'Typ' : 'Type'}</div>
        <div>{de ? 'Nummer' : 'Number'}</div>
        <div>{de ? 'Titel' : 'Title'}</div>
        <div>{de ? 'Datum' : 'Date'}</div>
        <div className="text-right">{de ? 'Betrag' : 'Amount'}</div>
      </div>
      {docs.map((doc) => {
        const num = doc.quotationNumber || doc.orderNumber || doc.invoiceNumber;
        const StatusBadge =
          doc.docType === 'quotation' ? QuotationStatusBadge
          : doc.docType === 'order' ? OrderStatusBadge
          : InvoiceStatusBadge;
        return (
          <div key={doc._id} className="grid grid-cols-[5rem_8rem_1fr_6rem_6rem] border-b border-white/4 last:border-0 px-3 py-2.5 hover:bg-white/3 transition-colors">
            <div><StatusBadge status={doc.status} /></div>
            <div className="font-mono text-white/40 text-[13px]">{num}</div>
            <div className="truncate text-[13px] text-white/80">{doc.title || doc.customerName || '—'}</div>
            <div className="text-[13px] text-white/40">{fmtDate(doc.createdAt)}</div>
            <div className="text-right font-medium text-[13px] text-white/80">{fmt(doc.grandTotalRounded)} {doc.currency}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Attachments section ──────────────────────────────────────────────────────
function CustomerAttachmentsSection({ customerId, attachments, canWrite, de }) {
  const { upload, rename, remove, bulkRemove, download } = useAttachmentMutations(customerId);
  const fileInputRef = useRef(null);

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
    <div className="mt-5">
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
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
          <div className="rounded-xl border border-white/6 overflow-hidden bg-[#0B0F18]">
            {/* Table header */}
            <div className="grid grid-cols-[1.5rem_1fr_5rem_6rem_1.75rem_5rem] items-center bg-white/3 border-b border-white/6 text-[11px] font-semibold uppercase tracking-wider text-white/35 px-3 py-2 gap-2">
              {canWrite
                ? <Checkbox checked={allSelected} onCheckedChange={toggleAll} className="border-white/20 data-[state=checked]:bg-white/20 data-[state=checked]:border-white/40" />
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
                    'grid grid-cols-[1.5rem_1fr_5rem_6rem_1.75rem_5rem] items-center border-b border-white/4 last:border-0 px-3 py-2.5 gap-2 transition-colors',
                    isSelected ? 'bg-white/5' : 'hover:bg-white/3',
                  )}
                >
                  {canWrite
                    ? <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(file._id)} className="border-white/20 data-[state=checked]:bg-white/20 data-[state=checked]:border-white/40" />
                    : <span />}
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
                    <span className="text-[13px] text-white/80 truncate">{file.originalName}</span>
                  </div>
                  <div className="text-[12px] text-white/40">{fmtBytes(file.sizeBytes)}</div>
                  <div className="text-[12px] text-white/40">{fmtDate(file.createdAt)}</div>
                  <div className="h-5 w-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-semibold text-white/50 shrink-0 select-none">
                    {uploaderInitials(file.uploadedBy)}
                  </div>
                  <div className="flex items-center gap-0.5 justify-end">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white/25 hover:text-white/70" onClick={() => download.mutate(file._id)} title={de ? 'Herunterladen' : 'Download'}>
                      <Download className="h-3 w-3" />
                    </Button>
                    {canWrite && (
                      <>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white/25 hover:text-white/70" onClick={() => openRename(file)} title={de ? 'Umbenennen' : 'Rename'}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white/25 hover:text-red-400" onClick={() => setDeleteTarget(file._id)} title={de ? 'Löschen' : 'Delete'}>
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
            <div className="mt-2 flex items-center gap-2 bg-white/5 border border-white/8 rounded-lg px-3 py-2">
              <span className="text-[12px] text-white/50 flex-1">
                {selected.size} {de ? 'ausgewählt' : 'selected'}
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-400/10 gap-1.5" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-3 w-3" />
                {de ? 'Löschen' : 'Delete selected'}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/30 hover:text-white/70" onClick={() => setSelected(new Set())}>
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

// ─── Main tab orchestrator ────────────────────────────────────────────────────
function CustomerDocumentsTab({ customerId, de }) {
  const { data: businessDocs = [], isLoading: docsLoading } = useCustomerDocuments(customerId);
  const { data: attachments = [], isLoading: attachmentsLoading } = useCustomerAttachments(customerId);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');

  if (docsLoading || attachmentsLoading) return <Skeleton className="h-32 w-full" />;

  if (businessDocs.length === 0 && attachments.length === 0) {
    return <DocumentsAnimatedEmpty customerId={customerId} de={de} canWrite={canWrite} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-2">
          {de ? 'Geschäftsdokumente' : 'Business Documents'}
        </p>
        <CustomerBusinessDocsSection docs={businessDocs} de={de} />
      </div>
      <CustomerAttachmentsSection
        customerId={customerId}
        attachments={attachments}
        canWrite={canWrite}
        de={de}
      />
    </div>
  );
}

export function CustomerDetail() {
  const { t, locale } = useLanguage();
  const de = locale === 'de';
  const { id } = useParams();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const [formOpen, setFormOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');
  const canMerge = hasPermission('crm:admin');

  const { data: customer, isLoading } = useQuery({
    queryKey: queryKeys.crm.customers.detail(id),
    queryFn: () => customerService.getCustomerById(id),
    enabled: !!id,
  });

  const { update, archive, merge } = useCustomerMutations({
    onUpdate: () => setFormOpen(false),
    onArchive: () => router.push('/crm/customers'),
    onMerge: () => {
      setMergeOpen(false);
      router.push('/crm/customers');
    },
  });

  if (isLoading) return <DetailSkeleton />;
  if (!customer) return <EmptyState title={t('crm.notFound', 'Customer not found')} description={t('crm.notFoundDesc', 'The requested customer does not exist.')} />;

  const accent = pickCustomerAccent(customer);
  const isBusiness = customer.type === 'business';
  const Icon = isBusiness ? Building2 : User;
  const isArchived = customer.status === 'archived';

  const fullAddress = [
    customer.street,
    [customer.postalCode, customer.city].filter(Boolean).join(' '),
    customer.canton ? cantonName(customer.canton) : null,
    customer.country,
  ].filter(Boolean).join(', ');

  const handleSubmit = (data) => update.mutateAsync({ id, data });

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-white/35">
        <Link href="/crm/customers" className="hover:text-white/65 transition-colors">
          {t('crm.title', 'CRM')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/crm/customers" className="hover:text-white/65 transition-colors">
          {t('sidebar.customers', 'Customers')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-white/70 font-medium truncate">{customer.name}</span>
      </nav>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          {/* Hero profile card */}
          <div className="rounded-2xl border border-white/7 bg-[#0D1117] overflow-hidden">
            {/* Accent stripe */}
            <div className={cn('h-1 w-full bg-linear-to-r', accent.bar)} />
            <div className="p-6 text-center">
              <div className="relative inline-flex mb-4">
                <div className={cn('h-20 w-20 rounded-2xl flex items-center justify-center ring-1', accent.bg, accent.ring)}>
                  <Icon className={cn('h-10 w-10', accent.text)} />
                </div>
              </div>

              <h1 className="text-[18px] font-bold text-white/90 tracking-tight mb-1 truncate">{customer.name}</h1>
              {customer.customerNumber && (
                <p className="text-xs font-mono text-white/35 mb-3">{customer.customerNumber}</p>
              )}

              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                  isArchived
                    ? 'bg-white/5 text-white/40'
                    : 'bg-emerald-500/10 text-emerald-400',
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isArchived ? 'bg-white/20' : 'bg-emerald-500')} />
                  {isArchived ? t('crm.statusArchived', 'Archived') : t('crm.statusActive', 'Active')}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                  isBusiness
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-blue-500/10 text-blue-400',
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isBusiness ? 'bg-emerald-500' : 'bg-blue-500')} />
                  {isBusiness ? t('crm.typeBusiness', 'Business') : t('crm.typePrivate', 'Private')}
                </span>
              </div>

              <Separator className="my-4 bg-white/6" />

              <div className="flex items-center justify-center gap-2">
                {canWrite && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg border-white/10 bg-white/4 text-white/55 hover:bg-white/8 hover:text-white/80" onClick={() => setFormOpen(true)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('common.edit', 'Edit')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {customer.email && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-lg border-white/10 bg-white/4 text-white/55 hover:bg-white/8 hover:text-white/80"
                          onClick={() => { navigator.clipboard.writeText(customer.email); showSuccess(t('crm.copyEmail', 'Email copied')); }}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('crm.copyEmail', 'Copy email')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-lg border-white/10 bg-white/4 text-white/55 hover:bg-white/8 hover:text-white/80"
                        onClick={() => { navigator.clipboard.writeText(customer._id); showSuccess(t('crm.copyId', 'ID copied')); }}
                      >
                        <Hash className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('crm.copyId', 'Copy ID')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {canMerge && !isArchived && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-lg border-white/10 bg-white/4 text-white/55 hover:border-amber-500/40 hover:text-amber-400 hover:bg-amber-500/10"
                          onClick={() => setMergeOpen(true)}
                        >
                          <GitMerge className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('crm.merge', 'Merge')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {canDelete && !isArchived && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-lg border-white/10 bg-white/4 text-white/55 hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => setArchiveOpen(true)}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('crm.archive', 'Archive')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>

          {/* Contact card */}
          <div className="rounded-xl border border-white/6 bg-[#0D1117] p-4 space-y-1">
            <SidebarRow t={t} icon={Mail} iconBg="bg-sky-500/10" iconColor="text-sky-400" label={t('crm.email', 'Email')} value={customer.email} />
            <SidebarRow t={t} icon={Phone} iconBg="bg-emerald-500/10" iconColor="text-emerald-400" label={t('crm.phone', 'Phone')} value={formatPhone(customer.phone) || customer.phone} rawValue={customer.phone} />
            <SidebarRow t={t} icon={Phone} iconBg="bg-emerald-500/10" iconColor="text-emerald-400" label={t('crm.mobile', 'Mobile')} value={formatPhone(customer.mobile) || customer.mobile} rawValue={customer.mobile} />
            {isBusiness && (
              <SidebarRow t={t} icon={User} iconBg="bg-emerald-500/10" iconColor="text-emerald-400" label={t('crm.ownerName', 'Owner name')} value={customer.ownerName} />
            )}
            <SidebarRow t={t} icon={ReceiptText} iconBg="bg-amber-500/10" iconColor="text-amber-400" label={t('crm.uidVat', 'UID / VAT')} value={customer.uidNumber || customer.vatNumber} />
            <SidebarRow t={t} icon={Globe} iconBg="bg-indigo-500/10" iconColor="text-indigo-400" label={t('crm.website', 'Website')} value={customer.website} />
          </div>

          {/* Address card */}
          {fullAddress && (
            <div className="rounded-xl border border-white/6 bg-[#0D1117] p-4 space-y-1">
              <SidebarRow t={t} icon={MapPin} iconBg="bg-amber-500/10" iconColor="text-amber-400" label={t('crm.address', 'Address')} value={fullAddress} />
            </div>
          )}

          {/* Metadata card */}
          <div className="rounded-xl border border-white/6 bg-[#0D1117] p-4 space-y-1">
            <SidebarRow t={t} icon={Calendar} iconBg="bg-violet-500/10" iconColor="text-violet-400" label={t('crm.created', 'Created')} value={formatDate(customer.createdAt)} />
            <SidebarRow t={t} icon={Calendar} iconBg="bg-violet-500/10" iconColor="text-violet-400" label={t('crm.updated', 'Updated')} value={formatDate(customer.updatedAt)} />
            <SidebarRow t={t} icon={BellRing} iconBg="bg-amber-500/10" iconColor="text-amber-400" label={t('crm.newsletter', 'Newsletter')} value={customer.newsletterOptIn ? t('crm.optedIn', 'Opted in') : t('crm.optedOut', 'Opted out')} />
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList variant="line">
              <TabsTrigger value="overview" className="gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                {t('crm.tabOverview', 'Overview')}
              </TabsTrigger>
              <TabsTrigger value="contacts" className="gap-1.5">
                <UsersIcon className="h-3.5 w-3.5" />
                {t('crm.tabContacts', 'Contacts')}
              </TabsTrigger>
              <TabsTrigger value="sites" className="gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                {t('crm.tabSites', 'Objects')}
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {t('crm.tabActivity', 'Activity')}
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                {de ? 'Dokumente' : 'Documents'}
              </TabsTrigger>
              <TabsTrigger value="photos" className="gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" />
                {t('crm.tabPhotos', 'Photos')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-3 sm:grid-cols-2 p-4 bg-white/2 rounded-xl border border-white/5">
                <InfoGridCell label={t('crm.type', 'Type')} value={isBusiness ? t('crm.typeBusiness', 'Business') : t('crm.typePrivate', 'Private')} />
                {isBusiness && (
                  <InfoGridCell label={t('crm.ownerName', 'Owner name')} value={customer.ownerName || 'â€”'} />
                )}
                <InfoGridCell label={t('crm.customerNumber', 'Customer number')} value={customer.customerNumber || '—'} mono />
                <InfoGridCell label={t('crm.uidVat', 'UID / VAT')} value={customer.uidNumber || customer.vatNumber || '—'} mono />
                <InfoGridCell label={t('crm.email', 'Email')} value={customer.email || '—'} />
                <InfoGridCell label={t('crm.phone', 'Phone')} value={formatPhone(customer.phone) || formatPhone(customer.mobile) || '—'} />
                {fullAddress && (
                  <InfoGridCell label={t('crm.address', 'Address')} value={fullAddress} className="sm:col-span-2" />
                )}
              </div>
              {customer.notes && (
                <div className="mt-3 rounded-xl border border-white/5 bg-white/2 p-4 flex items-start gap-3.5">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-rose-500/10">
                    <FileText className="h-5 w-5 text-rose-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">{t('crm.notes', 'Notes')}</p>
                    <RichTextContent html={customer.notes} className="text-[13px] text-white/70" />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="contacts">
              <ContactsPanel customerId={customer._id} />
            </TabsContent>

            <TabsContent value="sites">
              <SitesPanel customerId={customer._id} />
            </TabsContent>

            <TabsContent value="activity">
              <CustomerActivityPanel customerId={customer._id} />
            </TabsContent>
            <TabsContent value="documents">
              <CustomerDocumentsTab customerId={customer._id} de={de} />
            </TabsContent>
            <TabsContent value="photos">
              <ImagesPanel entityType="customer" entityId={customer._id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      <CustomerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={customer}
        isLoading={update.isPending}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t('crm.confirmArchive', 'Archive customer?')}
        description={`${t('crm.archiveDesc', 'Are you sure you want to archive this customer?')} — "${customer.name}"`}
        onConfirm={() => archive.mutate(id)}
        loading={archive.isPending}
        confirmText={t('crm.archive', 'Archive')}
        variant="destructive"
      />

      <CustomerMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        source={customer}
        loading={merge.isPending}
        onConfirm={({ sourceId, targetId }) => merge.mutate({ sourceId, targetId })}
      />
    </div>
  );
}

function SidebarRow({ t, icon: Icon, iconBg, iconColor, label, value, rawValue }) {
  if (!value) {
    return (
      <div className="flex items-center gap-3 py-2 px-2 rounded-lg">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg || 'bg-white/5')}>
          <Icon className={cn('h-3.5 w-3.5 opacity-40', iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">{label}</p>
          <p className="text-[13px] text-white/20">—</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/3 transition-colors group">
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-[13px] font-medium text-white/80 truncate">{value}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-white/40 hover:text-white/70 hover:bg-white/5"
        onClick={() => {
          navigator.clipboard.writeText(String(rawValue ?? value));
          showSuccess(t ? t('common.copied', 'Copied') : 'Copied');
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

function InfoGridCell({ label, value, mono, className }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">{label}</p>
      <p className={cn('text-[13px] text-white/80', mono && 'font-mono')}>{value || '—'}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          <div className="rounded-2xl border border-white/7 bg-[#0D1117] p-6 flex flex-col items-center">
            <Skeleton className="h-20 w-20 rounded-2xl mb-4" />
            <Skeleton className="h-5 w-40 mb-2" />
            <Skeleton className="h-4 w-24 mb-4" />
            <div className="flex gap-2 mb-4">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Separator className="w-full my-4 bg-white/6" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-6">
          <Skeleton className="h-10 w-96" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
