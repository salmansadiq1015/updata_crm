'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useCustomerMutations } from '@/modules/crm/hooks/use-customer-mutations';
import { CustomerForm } from '@/modules/crm/components/customer-form';
import { CustomerMergeDialog } from '@/modules/crm/components/customer-merge-dialog';
import { CustomerActivityPanel } from '@/modules/crm/components/customer-activity-panel';
import { ContactsPanel } from '@/modules/crm/components/contacts-panel';
import { SitesPanel } from '@/modules/crm/components/sites-panel';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { RichTextContent } from '@/components/ui/rich-text-content';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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
} from 'lucide-react';
import { pickCustomerAccent, CH_CANTONS } from '@/modules/crm/constants/customer-constants';

const cantonName = (code) => CH_CANTONS.find((c) => c.code === code)?.name || code;

export function CustomerDetail() {
  const { t } = useLanguage();
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
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/crm/customers" className="hover:text-foreground transition-colors">
          {t('crm.title', 'CRM')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/crm/customers" className="hover:text-foreground transition-colors">
          {t('sidebar.customers', 'Customers')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate">{customer.name}</span>
      </nav>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          {/* Profile card */}
          <div className="relative rounded-xl border border-border bg-card overflow-hidden shadow-theme-sm">
            <div className={cn('h-1 bg-linear-to-r', accent.bar)} />
            <div className="p-6 text-center">
              <div className="relative inline-flex mb-4">
                <div className={cn('h-20 w-20 rounded-2xl flex items-center justify-center ring-2 shadow-theme-sm', accent.bg, accent.ring)}>
                  <Icon className={cn('h-10 w-10', accent.text)} />
                </div>
              </div>

              <h1 className="text-lg font-bold tracking-tight mb-1 truncate">{customer.name}</h1>
              {customer.customerNumber && (
                <p className="text-xs font-mono text-muted-foreground mb-3">{customer.customerNumber}</p>
              )}

              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                  isArchived
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isArchived ? 'bg-muted-foreground/40' : 'bg-emerald-500')} />
                  {isArchived ? t('crm.statusArchived', 'Archived') : t('crm.statusActive', 'Active')}
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

              <Separator className="my-4" />

              <div className="flex items-center justify-center gap-2">
                {canWrite && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setFormOpen(true)}>
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
                          className="h-9 w-9 rounded-lg"
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
                        className="h-9 w-9 rounded-lg"
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
                          className="h-9 w-9 rounded-lg hover:border-amber-500/40 hover:text-amber-600 hover:bg-amber-500/10"
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
                          className="h-9 w-9 rounded-lg hover:border-destructive/40 hover:text-destructive hover:bg-destructive/10"
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
          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-theme-sm">
            <SidebarRow t={t} icon={Mail} iconBg="bg-sky-500/10" iconColor="text-sky-500" label={t('crm.email', 'Email')} value={customer.email} />
            <SidebarRow t={t} icon={Phone} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" label={t('crm.phone', 'Phone')} value={formatPhone(customer.phone) || customer.phone} rawValue={customer.phone} />
            <SidebarRow t={t} icon={Phone} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" label={t('crm.mobile', 'Mobile')} value={formatPhone(customer.mobile) || customer.mobile} rawValue={customer.mobile} />
            <SidebarRow t={t} icon={Globe} iconBg="bg-indigo-500/10" iconColor="text-indigo-500" label={t('crm.website', 'Website')} value={customer.website} />
          </div>

          {/* Address card */}
          {fullAddress && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-theme-sm">
              <SidebarRow t={t} icon={MapPin} iconBg="bg-amber-500/10" iconColor="text-amber-500" label={t('crm.address', 'Address')} value={fullAddress} />
            </div>
          )}

          {/* Metadata card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-theme-sm">
            <SidebarRow
              t={t}
              icon={Calendar}
              iconBg="bg-violet-500/10"
              iconColor="text-violet-500"
              label={t('crm.created', 'Created')}
              value={formatDate(customer.createdAt)}
            />
            <SidebarRow
              t={t}
              icon={Calendar}
              iconBg="bg-violet-500/10"
              iconColor="text-violet-500"
              label={t('crm.updated', 'Updated')}
              value={formatDate(customer.updatedAt)}
            />
            <SidebarRow
              t={t}
              icon={BellRing}
              iconBg="bg-amber-500/10"
              iconColor="text-amber-500"
              label={t('crm.newsletter', 'Newsletter')}
              value={customer.newsletterOptIn ? t('crm.optedIn', 'Opted in') : t('crm.optedOut', 'Opted out')}
            />
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
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-4 sm:grid-cols-2">
                <OverviewInfoCard icon={Icon} iconBg={accent.bg} iconColor={accent.text} label={t('crm.type', 'Type')} value={isBusiness ? t('crm.typeBusiness', 'Business') : t('crm.typePrivate', 'Private')} />
                <OverviewInfoCard icon={Hash} iconBg="bg-violet-500/10" iconColor="text-violet-500" label={t('crm.customerNumber', 'Customer number')} value={customer.customerNumber || '—'} />
                <OverviewInfoCard icon={Mail} iconBg="bg-sky-500/10" iconColor="text-sky-500" label={t('crm.email', 'Email')} value={customer.email || '—'} />
                <OverviewInfoCard icon={Phone} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" label={t('crm.phone', 'Phone')} value={formatPhone(customer.phone) || formatPhone(customer.mobile) || '—'} />
                {fullAddress && (
                  <OverviewInfoCard icon={MapPin} iconBg="bg-amber-500/10" iconColor="text-amber-500" label={t('crm.address', 'Address')} value={fullAddress} className="sm:col-span-2" />
                )}
                {customer.notes && (
                  <div className={cn('rounded-xl border border-border bg-card ring-1 ring-foreground/5 hover:border-border transition-all p-4 flex items-start gap-3.5 sm:col-span-2')}>
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-rose-500/10">
                      <FileText className="h-4.5 w-4.5 text-rose-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground mb-0.5">{t('crm.notes', 'Notes')}</p>
                      <RichTextContent html={customer.notes} className="text-sm" />
                    </div>
                  </div>
                )}
              </div>
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
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg || 'bg-muted')}>
          <Icon className={cn('h-3.5 w-3.5 opacity-50', iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">{label}</p>
          <p className="text-sm text-muted-foreground/40">—</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors group">
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
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

function OverviewInfoCard({ icon: Icon, iconBg, iconColor, label, value, className }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card ring-1 ring-foreground/5 hover:border-border transition-all p-4 flex items-start gap-3.5', className)}>
      <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('h-4.5 w-4.5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm font-semibold break-words">{value}</p>
      </div>
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
          <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center">
            <Skeleton className="h-20 w-20 rounded-2xl mb-4" />
            <Skeleton className="h-5 w-40 mb-2" />
            <Skeleton className="h-4 w-24 mb-4" />
            <div className="flex gap-2 mb-4">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Separator className="w-full my-4" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-32" /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-6">
          <Skeleton className="h-10 w-96" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3.5">
                <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-28" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
