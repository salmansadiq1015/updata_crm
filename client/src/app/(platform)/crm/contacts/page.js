'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { contactService } from '@/modules/crm/services/contact-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatPhone } from '@/lib/formatters';
import { Search, Building2, Mail } from 'lucide-react';

export default function ContactsPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const debouncedSearch = useDebounce(search, 300);
  const q = debouncedSearch.trim();

  const { data, isFetching } = useQuery({
    queryKey: q ? queryKeys.crm.contacts.search(q) : queryKeys.crm.contacts.all(),
    queryFn: () => (q ? contactService.search(q, 50) : contactService.listAll()),
    placeholderData: (prev) => prev,
  });

  const contacts = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: t('common.name', 'Name'),
      size: 280,
      Cell: ({ row }) => {
        const c = row.original;
        const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
        return (
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-sm truncate">{fullName}</span>
            {c.isPrimary && (
              <Badge variant="success" className="shrink-0">
                {t('crm.contacts.primaryBadge', 'Primary')}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'functionTitle',
      header: t('crm.contacts.functionTitle', 'Function / Position'),
      size: 200,
      Cell: ({ row }) => {
        const fn = row.original.functionTitle;
        return fn
          ? <span className="text-sm">{fn}</span>
          : <span className="text-xs text-muted-foreground/60">—</span>;
      },
    },
    {
      accessorKey: 'phone',
      header: t('crm.phone', 'Phone'),
      size: 160,
      Cell: ({ row }) => {
        const c = row.original;
        const phone = c.phone || c.mobile;
        if (!phone) return <span className="text-xs text-muted-foreground/60">—</span>;
        return <span className="text-sm">{formatPhone(phone)}</span>;
      },
    },
    {
      accessorKey: 'email',
      header: t('crm.email', 'Email'),
      size: 240,
      Cell: ({ row }) => {
        const email = row.original.email;
        if (!email) return <span className="text-xs text-muted-foreground/60">—</span>;
        return (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{email}</span>
          </a>
        );
      },
    },
    {
      accessorKey: 'customer',
      header: t('crm.customer', 'Customer'),
      size: 240,
      Cell: ({ row }) => {
        const customer = row.original.customerId;
        // customerId is populated to { _id, name, customerNumber } by the API.
        const id = typeof customer === 'object' && customer ? customer._id : customer;
        const name = typeof customer === 'object' && customer ? customer.name : null;
        if (!id) return <span className="text-xs text-muted-foreground/60">—</span>;
        return (
          <Link
            href={`/crm/customers/${id}`}
            className="inline-flex items-center gap-2 text-sm group min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate group-hover:text-primary transition-colors">
              {name || t('crm.customer', 'Customer')}
            </span>
          </Link>
        );
      },
    },
  ], [t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('crm.contacts.title', 'Contacts')}
        description={t('crm.contacts.description', 'All points of contact across every customer.')}
        count={contacts.length}
      >
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('crm.contacts.searchPlaceholder', 'Search by name or email...')}
            className="h-9 pl-9 rounded-lg"
          />
        </div>
      </PageHeader>

      <DataTableShell
        columns={columns}
        data={contacts}
        isLoading={isFetching && contacts.length === 0}
        rowCount={contacts.length}
        manualPagination={false}
        pagination={pagination}
        onPaginationChange={setPagination}
        manualSorting={false}
        manualFiltering={false}
        enableGlobalFilter={false}
      />
    </div>
  );
}
