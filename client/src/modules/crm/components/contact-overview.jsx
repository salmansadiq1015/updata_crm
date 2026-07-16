'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatPhone } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useContactOverview } from '@/modules/crm/hooks/use-contact-overview';
import { ContactForm } from '@/modules/crm/components/contact-form';
import { CustomerPicker } from '@/modules/crm/components/customer-picker';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Archive,
  Building2,
  Briefcase,
  ClipboardList,
  Eye,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Star,
  UserRound,
  UsersRound,
} from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'all', labelKey: 'crm.contacts.typeAll', fallback: 'All contact types' },
  { value: 'private', labelKey: 'crm.contacts.typePrivate', fallback: 'Private Contacts' },
  { value: 'business', labelKey: 'crm.contacts.typeBusiness', fallback: 'Company Contacts' },
];

function getCustomer(contact) {
  return contact?.customer || (typeof contact?.customerId === 'object' ? contact.customerId : null);
}

function getContactName(contact) {
  return [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || '-';
}

function getCustomerAddressLine(customer) {
  const locality = [customer?.postalCode, customer?.city].filter(Boolean).join(' ');
  return [
    customer?.street,
    locality,
    customer?.canton,
    customer?.country,
  ].filter(Boolean).join(', ');
}

function getCustomerId(contact) {
  const customer = getCustomer(contact);
  return customer?._id || (typeof contact?.customerId === 'string' ? contact.customerId : null);
}

function getContactTypeMeta(contact, t) {
  const type = contact?.contactType || getCustomer(contact)?.type;
  const isPrivate = type === 'private';
  return {
    label: isPrivate
      ? t('crm.contacts.privateContact', 'Private Contact')
      : t('crm.contacts.companyContact', 'Company Contact'),
    icon: isPrivate ? UserRound : Building2,
    className: isPrivate
      ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-500/20'
      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20',
  };
}

export function ContactOverview() {
  const { t } = useLanguage();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const {
    contacts,
    summary,
    serverPagination,
    isFetching,
    isError,
    error,
    refetch,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    pagination,
    setPagination,
    createContact,
    updateContact,
    archiveContact,
    setPrimaryContact,
  } = useContactOverview();

  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerError, setCustomerError] = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);

  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');
  const hasActiveFilters = search.trim() || typeFilter !== 'all';
  const rowCount = serverPagination?.total ?? contacts.length;

  const openCreate = () => {
    setEditContact(null);
    setSelectedCustomer(null);
    setCustomerError('');
    setFormOpen(true);
  };

  const openEdit = (contact) => {
    setEditContact(contact);
    setSelectedCustomer(null);
    setCustomerError('');
    setFormOpen(true);
  };

  const handleFormOpenChange = (nextOpen) => {
    setFormOpen(nextOpen);
    if (!nextOpen) {
      setEditContact(null);
      setSelectedCustomer(null);
      setCustomerError('');
    }
  };

  const handleSubmit = async (payload) => {
    if (editContact?._id) {
      await updateContact.mutateAsync({
        id: editContact._id,
        customerId: getCustomerId(editContact),
        payload,
      });
      setEditContact(null);
      return;
    }

    if (!selectedCustomer?._id) {
      setCustomerError(t('crm.contacts.customerRequired', 'Bitte zuerst einen Kunden auswaehlen.'));
      throw new Error('customer-required');
    }

    await createContact.mutateAsync({
      customerId: selectedCustomer._id,
      payload,
    });
  };

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: t('common.name', 'Name'),
      size: 300,
      enableSorting: false,
      Cell: ({ row }) => {
        const contact = row.original;
        const meta = getContactTypeMeta(contact, t);
        const TypeIcon = meta.icon;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1', meta.className)}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {getContactName(contact)}
                </span>
                {contact.isPrimary && (
                  <Badge className="h-5 shrink-0 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-400">
                    <Star className="mr-1 h-2.5 w-2.5 fill-current" />
                    {t('crm.contacts.primaryBadge', 'Primaer')}
                  </Badge>
                )}
              </div>
              <span className={cn('mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1', meta.className)}>
                {meta.label}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'functionTitle',
      header: t('crm.contacts.functionTitle', 'Funktion / Position'),
      size: 180,
      enableSorting: false,
      Cell: ({ row }) => (
        row.original.functionTitle
          ? <span className="text-[13px] text-foreground">{row.original.functionTitle}</span>
          : <span className="text-[13px] text-muted-foreground/60">-</span>
      ),
    },
    {
      accessorKey: 'contact',
      header: t('crm.contacts.contactData', 'Contact data'),
      size: 270,
      enableSorting: false,
      Cell: ({ row }) => <ContactMethods contact={row.original} />,
    },
    {
      accessorKey: 'customer',
      header: t('crm.customer', 'Customer'),
      size: 260,
      enableSorting: false,
      Cell: ({ row }) => <CustomerLink contact={row.original} />,
    },
    {
      accessorKey: 'related',
      header: t('crm.contacts.links', 'Links'),
      size: 320,
      enableSorting: false,
      Cell: ({ row }) => <RelatedLinks contact={row.original} t={t} />,
    },
  ], [t]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('crm.contacts.title', 'Kontakte')}
        description={t('crm.contacts.overviewDescription', 'Central overview of private and company contacts.')}
        icon={UsersRound}
        count={serverPagination?.total ?? summary.total}
      >
        <PermissionGate permission="crm:write">
          <Button className="h-9 gap-2 rounded-lg" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t('crm.contacts.newContact', 'Neuer Kontakt')}
          </Button>
        </PermissionGate>
      </PageHeader>

      <ContactSummary summary={summary} typeFilter={typeFilter} t={t} />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('crm.contacts.searchPlaceholderWide', 'Search name, email, phone, customer...')}
              className="h-9 rounded-lg pl-9"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-full rounded-lg sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey, option.fallback)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-end gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 gap-2 rounded-lg" onClick={clearFilters}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('common.reset', 'Reset')}
            </Button>
          )}
        </div>
      </div>

      {isError && contacts.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title={t('crm.contacts.loadError', 'Contacts could not be loaded')}
          description={error?.message || t('common.tryAgain', 'Please try again.')}
          action={(
            <Button size="sm" onClick={() => refetch()}>
              {t('common.retry', 'Retry')}
            </Button>
          )}
        />
      ) : (
        <DataTableShell
          columns={columns}
          data={contacts}
          isLoading={isFetching && contacts.length === 0}
          rowCount={rowCount}
          manualPagination
          manualSorting
          manualFiltering
          enableGlobalFilter={false}
          pagination={pagination}
          onPaginationChange={setPagination}
          emptyState={(
            <EmptyState
              icon={UsersRound}
              title={t('crm.contacts.empty', 'Keine Kontakte angelegt')}
              description={
                hasActiveFilters
                  ? t('crm.contacts.emptyFiltered', 'No contacts match the current filters.')
                  : t('crm.contacts.emptyDesc', 'Fuegen Sie den ersten Kontakt hinzu, um Ansprechpartner zu verwalten.')
              }
            />
          )}
          renderRowActions={({ row }) => {
            const contact = row.original;
            const customerId = getCustomerId(contact);
            return (
              <RowActionsMenu
                items={[
                  {
                    label: t('common.view', 'View'),
                    icon: Eye,
                    hidden: !customerId,
                    onSelect: () => router.push(`/crm/customers/${customerId}`),
                  },
                  {
                    label: t('common.edit', 'Edit'),
                    icon: Pencil,
                    hidden: !canWrite,
                    onSelect: () => openEdit(contact),
                  },
                  {
                    label: t('crm.contacts.setPrimary', 'Als primaer festlegen'),
                    icon: Star,
                    hidden: !canWrite || contact.isPrimary,
                    disabled: setPrimaryContact.isPending,
                    onSelect: () => setPrimaryContact.mutate({
                      id: contact._id,
                      customerId,
                    }),
                  },
                  { type: 'separator', hidden: !canDelete },
                  {
                    label: t('crm.contacts.archive', 'Archive contact'),
                    icon: Archive,
                    destructive: true,
                    hidden: !canDelete,
                    onSelect: () => setArchiveTarget(contact),
                  },
                ]}
              />
            );
          }}
        />
      )}

      <ContactForm
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        onSubmit={handleSubmit}
        defaultValues={editContact}
        isLoading={createContact.isPending || updateContact.isPending}
        contextField={!editContact ? (
          <CustomerPicker
            selectedCustomer={selectedCustomer}
            onSelect={(customer) => {
              setSelectedCustomer(customer);
              setCustomerError('');
            }}
            disabled={createContact.isPending}
            error={customerError}
          />
        ) : null}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={t('crm.contacts.archiveTitle', 'Archive contact?')}
        description={
          archiveTarget
            ? t('crm.contacts.archiveDesc', 'Archive "{name}"? The contact will disappear from active overviews.', {
                name: getContactName(archiveTarget),
              })
            : ''
        }
        onConfirm={() => {
          const customerId = getCustomerId(archiveTarget);
          archiveContact.mutate(
            { id: archiveTarget._id, customerId },
            { onSuccess: () => setArchiveTarget(null) },
          );
        }}
        loading={archiveContact.isPending}
        confirmText={t('crm.contacts.archive', 'Archive contact')}
        variant="destructive"
      />
    </div>
  );
}

function ContactSummary({ summary, typeFilter, t }) {
  const stats = [
    {
      key: 'total',
      label: t('crm.contacts.summaryTotal', 'All contacts'),
      value: summary.total,
      className: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-violet-500/20',
    },
    {
      key: 'private',
      label: t('crm.contacts.privateContact', 'Private Contact'),
      value: summary.private,
      className: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-500/20',
    },
    {
      key: 'business',
      label: t('crm.contacts.companyContact', 'Company Contact'),
      value: summary.business,
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20',
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {stats.map((stat) => (
        <div
          key={stat.key}
          className={cn(
            'flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 ring-1 ring-transparent',
            typeFilter === stat.key && stat.className,
            typeFilter === 'all' && stat.key === 'total' && stat.className,
          )}
        >
          <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
          <span className="text-lg font-semibold text-foreground">{stat.value || 0}</span>
        </div>
      ))}
    </div>
  );
}

function ContactMethods({ contact }) {
  const phone = contact.phone || contact.mobile;
  return (
    <div className="space-y-1">
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="flex min-w-0 items-center gap-1.5 text-[13px] text-foreground hover:text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{formatPhone(phone)}</span>
        </a>
      ) : (
        <span className="block text-[13px] text-muted-foreground/60">-</span>
      )}
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{contact.email}</span>
        </a>
      )}
    </div>
  );
}

function CustomerLink({ contact }) {
  const customer = getCustomer(contact);
  if (!customer?._id) return <span className="text-[13px] text-muted-foreground/60">-</span>;

  const address = getCustomerAddressLine(customer);
  return (
    <Link
      href={`/crm/customers/${customer._id}`}
      className="group flex min-w-0 items-center gap-2"
      onClick={(event) => event.stopPropagation()}
    >
      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-foreground group-hover:text-foreground">
          {customer.name}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[customer.customerNumber, address].filter(Boolean).join(' - ')}
        </span>
      </span>
    </Link>
  );
}

function RelatedLinks({ contact, t }) {
  const customerId = getCustomerId(contact);
  const related = contact.related || {};
  const links = [
    {
      key: 'projects',
      href: customerId ? `/projects?customerId=${customerId}` : '/projects',
      icon: Briefcase,
      label: t('crm.contacts.projects', 'Projects'),
      count: related.projectCount || 0,
    },
    {
      key: 'orders',
      href: customerId ? `/field-ops/orders?customerId=${customerId}` : '/field-ops/orders',
      icon: ClipboardList,
      label: t('crm.contacts.jobs', 'Jobs'),
      count: related.orderCount || 0,
    },
    {
      key: 'quotes',
      href: customerId ? `/quotes?customerId=${customerId}` : '/quotes',
      icon: FileText,
      label: t('crm.contacts.quotations', 'Quotes'),
      count: related.quotationCount || 0,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {links.map(({ key, ...link }) => (
        <RelatedChip key={key} {...link} />
      ))}
    </div>
  );
}

function RelatedChip({ href, icon: Icon, label, count }) {
  const content = (
    <>
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      <span className="font-semibold">{count}</span>
    </>
  );

  if (!count) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] text-muted-foreground/70">
        {content}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 text-[11px] text-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </Link>
  );
}
