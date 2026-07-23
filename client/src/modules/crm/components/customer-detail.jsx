'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { ATTACHMENT_ACCEPT, AttachmentUploadButton, fmtBytes, fileTypeIcon, uploaderInitials } from './customer-file-utils';
import { CustomerAttachmentsSection } from './customer-attachments-section';
import { useBreadcrumbLabel } from '@/stores/breadcrumb-store';
import {
  Pencil, Archive, Building2, User, Mail, Phone, Globe, MapPin,
  Copy, Hash, Calendar, BellRing, FileText,
  UsersIcon, ClipboardList, Activity, GitMerge,
  Upload, Download, Trash2, Loader2, X, ReceiptText,
  File, Image as ImageIcon, Paperclip,
} from 'lucide-react';
import { pickCustomerAccent, CH_CANTONS } from '@/modules/crm/constants/customer-constants';
import { recordRecentCustomer } from '@/modules/crm/utils/recent-customers';

const cantonName = (code) => CH_CANTONS.find((c) => c.code === code)?.name || code;
// Anrede / salutation (client feedback #1)
const SALUTATION_LABELS = { herr: 'Herr', frau: 'Frau', familie: 'Familie', firma: 'Firma', herr_frau: 'Herr und Frau', frau_herr: 'Frau und Herr' };
const salutationLabel = (code) => SALUTATION_LABELS[code] || '';

// Accepted attachment types — documents + images (scans/photos of contracts).
// Mirrors the server 'general' bucket policy (ALLOWED_MIME_TYPES.all minus audio/video).

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
      <div style={{ animation: 'doc-float 3s ease-in-out infinite' }} className="text-muted-foreground/50">
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="14" width="42" height="32" rx="4" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
          <path d="M5 22h42" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
          <rect x="5" y="9" width="19" height="9" rx="2" fill="currentColor" fillOpacity="0.20" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
          <path d="M17 33h18M17 39h12" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-center space-y-1">
        <p className="text-[13px] font-medium text-muted-foreground">
          {de ? 'Keine Dokumente vorhanden' : 'No documents yet'}
        </p>
        <p className="text-[12px] text-muted-foreground/60">
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
    <div className="rounded-xl border border-border overflow-hidden bg-card text-sm">
      <div className="grid grid-cols-[5rem_8rem_1fr_6rem_6rem] bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2">
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
          <div key={doc._id} className="grid grid-cols-[5rem_8rem_1fr_6rem_6rem] border-b border-border last:border-0 px-3 py-2.5 hover:bg-muted/40 transition-colors">
            <div><StatusBadge status={doc.status} /></div>
            <div className="font-mono text-muted-foreground text-[13px]">{num}</div>
            <div className="truncate text-[13px] text-foreground">{doc.title || doc.customerName || '—'}</div>
            <div className="text-[13px] text-muted-foreground">{fmtDate(doc.createdAt)}</div>
            <div className="text-right font-medium text-[13px] text-foreground">{fmt(doc.grandTotalRounded)} {doc.currency}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Attachments section ──────────────────────────────────────────────────────

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
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-2">
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
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');
  const canMerge = hasPermission('crm:merge');

  const { data: customer, isLoading } = useQuery({
    queryKey: queryKeys.crm.customers.detail(id),
    queryFn: () => customerService.getCustomerById(id),
    enabled: !!id,
  });

  // Remember this fiche for the dashboard "recently opened" quick-access widget.
  useEffect(() => {
    if (customer?._id) recordRecentCustomer(customer);
  }, [customer?._id, customer?.name, customer?.city, customer?.customerNumber]);

  const { update, deactivate, reactivate, merge } = useCustomerMutations({
    onUpdate: () => setFormOpen(false),
    onDeactivate: () => router.push('/crm/customers'),
    onMerge: () => {
      setMergeOpen(false);
      router.push('/crm/customers');
    },
  });

  useBreadcrumbLabel(id, customer?.name);

  if (isLoading) return <DetailSkeleton />;
  if (!customer) return <EmptyState title={t('crm.notFound', 'Customer not found')} description={t('crm.notFoundDesc', 'The requested customer does not exist.')} />;

  const accent = pickCustomerAccent(customer);
  const isBusiness = customer.type === 'business';
  const Icon = isBusiness ? Building2 : User;
  const isInactive = customer.status === 'inactive';

  const fullAddress = [
    customer.addressSupplement,
    customer.street,
    [customer.postalCode, customer.city].filter(Boolean).join(' '),
    customer.canton ? cantonName(customer.canton) : null,
    customer.country,
  ].filter(Boolean).join(', ');

  const handleSubmit = (data) => update.mutateAsync({ id, data });

  return (
    <div className="space-y-6">

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          {/* Hero profile card */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* Accent stripe */}
            <div className={cn('h-1 w-full bg-linear-to-r', accent.bar)} />
            <div className="p-6 text-center">
              <div className="relative inline-flex mb-4">
                <div className={cn('h-20 w-20 rounded-2xl flex items-center justify-center ring-1', accent.bg, accent.ring)}>
                  <Icon className={cn('h-10 w-10', accent.text)} />
                </div>
              </div>

              <h1 className="text-[18px] font-bold text-foreground tracking-tight mb-1 truncate">{customer.salutation ? `${salutationLabel(customer.salutation)} ${customer.name}` : customer.name}</h1>
              {customer.customerNumber && (
                <p className="text-xs font-mono text-muted-foreground mb-3">{customer.customerNumber}</p>
              )}

              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                  isInactive
                    ? 'bg-muted/60 text-muted-foreground'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isInactive ? 'bg-muted' : 'bg-emerald-500')} />
                  {isInactive ? t('crm.statusInactive', 'Deaktiviert') : t('crm.statusActive', 'Active')}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                  isBusiness
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isBusiness ? 'bg-emerald-500' : 'bg-blue-500')} />
                  {isBusiness ? t('crm.typeBusiness', 'Business') : t('crm.typePrivate', 'Private')}
                </span>
              </div>

              <Separator className="my-4 bg-border" />

              <div className="flex items-center justify-center gap-2">
                {canWrite && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg border-border bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground" onClick={() => setFormOpen(true)}>
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
                          className="h-9 w-9 rounded-lg border-border bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
                        className="h-9 w-9 rounded-lg border-border bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                        onClick={() => { navigator.clipboard.writeText(customer._id); showSuccess(t('crm.copyId', 'ID copied')); }}
                      >
                        <Hash className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('crm.copyId', 'Copy ID')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {canMerge && !isInactive && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-lg border-border bg-muted/50 text-muted-foreground hover:border-amber-500/40 hover:text-amber-400 hover:bg-amber-500/10"
                          onClick={() => setMergeOpen(true)}
                        >
                          <GitMerge className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('crm.merge', 'Merge')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {canDelete && !isInactive && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-lg border-border bg-muted/50 text-muted-foreground hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => setDeactivateOpen(true)}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('crm.deactivate', 'Deaktivieren')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>

          {/* Contact card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <SidebarRow t={t} icon={Mail} iconBg="bg-sky-500/10" iconColor="text-sky-700 dark:text-sky-400" label={t('crm.email', 'Email')} value={customer.email} />
            <SidebarRow t={t} icon={Phone} iconBg="bg-emerald-500/10" iconColor="text-emerald-700 dark:text-emerald-400" label={t('crm.phone', 'Phone')} value={formatPhone(customer.phone) || customer.phone} rawValue={customer.phone} />
            <SidebarRow t={t} icon={Phone} iconBg="bg-emerald-500/10" iconColor="text-emerald-700 dark:text-emerald-400" label={t('crm.mobile', 'Mobile')} value={formatPhone(customer.mobile) || customer.mobile} rawValue={customer.mobile} />
            {isBusiness && (
              <SidebarRow t={t} icon={User} iconBg="bg-emerald-500/10" iconColor="text-emerald-700 dark:text-emerald-400" label={t('crm.ownerName', 'Owner name')} value={customer.ownerName} />
            )}
            <SidebarRow t={t} icon={ReceiptText} iconBg="bg-amber-500/10" iconColor="text-amber-700 dark:text-amber-400" label={t('crm.uidVat', 'UID / VAT')} value={customer.uidNumber || customer.vatNumber} />
            <SidebarRow t={t} icon={Globe} iconBg="bg-indigo-500/10" iconColor="text-indigo-400" label={t('crm.website', 'Website')} value={customer.website} />
          </div>

          {/* Address card */}
          {fullAddress && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <SidebarRow t={t} icon={MapPin} iconBg="bg-amber-500/10" iconColor="text-amber-700 dark:text-amber-400" label={t('crm.address', 'Address')} value={fullAddress} />
            </div>
          )}

          {/* Metadata card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <SidebarRow t={t} icon={Calendar} iconBg="bg-brand-500/10" iconColor="text-brand-700 dark:text-brand-400" label={t('crm.created', 'Created')} value={formatDate(customer.createdAt)} />
            <SidebarRow t={t} icon={Calendar} iconBg="bg-brand-500/10" iconColor="text-brand-700 dark:text-brand-400" label={t('crm.updated', 'Updated')} value={formatDate(customer.updatedAt)} />
            <SidebarRow t={t} icon={BellRing} iconBg="bg-amber-500/10" iconColor="text-amber-700 dark:text-amber-400" label={t('crm.newsletter', 'Newsletter')} value={customer.newsletterOptIn ? t('crm.optedIn', 'Opted in') : t('crm.optedOut', 'Opted out')} />
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
              <div className="grid gap-3 sm:grid-cols-2 p-4 bg-muted/30 rounded-xl border border-border">
                <InfoGridCell label={t('crm.type', 'Type')} value={isBusiness ? t('crm.typeBusiness', 'Business') : t('crm.typePrivate', 'Private')} />
                {isBusiness && (
                  <InfoGridCell label={t('crm.ownerName', 'Owner name')} value={customer.ownerName || '-'} />
                )}
                <InfoGridCell label={t('crm.customerNumber', 'Customer number')} value={customer.customerNumber || '-'} mono />
                <InfoGridCell label={t('crm.uidVat', 'UID / VAT')} value={customer.uidNumber || customer.vatNumber || '-'} mono />
                <InfoGridCell label={t('crm.email', 'Email')} value={customer.email || '-'} />
                <InfoGridCell label={t('crm.phone', 'Phone')} value={formatPhone(customer.phone) || formatPhone(customer.mobile) || '-'} />
                {fullAddress && (
                  <InfoGridCell label={t('crm.address', 'Address')} value={fullAddress} className="sm:col-span-2" />
                )}
              </div>
              {customer.notes && (
                <div className="mt-3 rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3.5">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-rose-500/10">
                    <FileText className="h-5 w-5 text-rose-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">{t('crm.notes', 'Notes')}</p>
                    <RichTextContent html={customer.notes} className="text-[13px] text-foreground" />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="contacts">
              <ContactsPanel customerId={customer._id} />
            </TabsContent>

            <TabsContent value="sites">
              <SitesPanel customerId={customer._id} customer={customer} />
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
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={t('crm.confirmDeactivate', 'Kunde deaktivieren?')}
        description={`${t('crm.deactivateDesc', 'Der Kunde bleibt erhalten und kann jederzeit reaktiviert werden.')} — "${customer.name}"`}
        onConfirm={() => deactivate.mutate(id)}
        loading={deactivate.isPending}
        confirmText={t('crm.deactivate', 'Deaktivieren')}
        variant="destructive"
      />

      <CustomerMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        source={customer}
        loading={merge.isPending}
        onConfirm={({ sourceId, targetId, fieldOverrides }) => merge.mutate({ sourceId, targetId, fieldOverrides })}
      />
    </div>
  );
}

function SidebarRow({ t, icon: Icon, iconBg, iconColor, label, value, rawValue }) {
  if (!value) {
    return (
      <div className="flex items-center gap-3 py-2 px-2 rounded-lg">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg || 'bg-muted/60')}>
          <Icon className={cn('h-3.5 w-3.5 opacity-40', iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground/80 uppercase tracking-wider font-medium">{label}</p>
          <p className="text-[13px] text-muted-foreground/50">-</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/40 transition-colors group">
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground/80 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-[13px] font-medium text-foreground truncate">{value}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/60"
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
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">{label}</p>
      <p className={cn('text-[13px] text-foreground', mono && 'font-mono')}>{value || '-'}</p>
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
          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center">
            <Skeleton className="h-20 w-20 rounded-2xl mb-4" />
            <Skeleton className="h-5 w-40 mb-2" />
            <Skeleton className="h-4 w-24 mb-4" />
            <div className="flex gap-2 mb-4">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Separator className="w-full my-4 bg-border" />
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
