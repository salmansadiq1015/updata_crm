'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { customerService, normalizeCustomerList } from '@/modules/crm/services/customer-service';
import { cn } from '@/lib/utils';

const CUSTOMER_PICKER_LIMIT = 20;
const CUSTOMER_PICKER_LIST_PARAMS = Object.freeze({
  limit: CUSTOMER_PICKER_LIMIT,
  sortBy: 'name',
  sortOrder: 'asc',
  status: 'active',
});

export function CustomerPicker({ selectedCustomer, onSelect, disabled = false, error }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250).trim();

  const { data, isFetching, isError } = useQuery({
    queryKey: debouncedSearch.length >= 2
      ? queryKeys.crm.customers.search(debouncedSearch)
      : queryKeys.crm.customers.list(CUSTOMER_PICKER_LIST_PARAMS),
    queryFn: () => (
      debouncedSearch.length >= 2
        ? customerService.searchCustomers(debouncedSearch, CUSTOMER_PICKER_LIMIT)
        : customerService.getCustomers(CUSTOMER_PICKER_LIST_PARAMS)
    ),
    enabled: open,
    staleTime: 120_000,
  });

  const customers = useMemo(() => normalizeCustomerList(data), [data]);

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'h-10 w-full justify-between rounded-lg border-border bg-muted/50 px-3 text-left text-[13px] font-normal text-foreground hover:bg-muted/70 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/90 dark:hover:bg-white/[0.06]',
              error && 'border-red-400/70',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground dark:text-white/40" />
              <span className={cn('truncate', !selectedCustomer?.name && 'text-muted-foreground')}>
                {selectedCustomer?.name || t('crm.contacts.selectCustomer', 'Kunde auswählen')}
              </span>
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] overflow-hidden rounded-xl border-border bg-popover p-0 shadow-2xl dark:border-white/10 dark:bg-[#0D1117]" align="start">
          <div className="border-b border-border p-2 dark:border-white/[0.08]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('crm.contacts.customerSearch', 'Kunde suchen...')}
                className="h-9 rounded-lg border-input bg-background pl-8 text-[13px] text-foreground placeholder:text-muted-foreground/60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/90 dark:placeholder:text-white/30"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            {customers.map((customer) => {
              const selected = selectedCustomer?._id === customer._id;
              return (
                <button
                  key={customer._id}
                  type="button"
                  onClick={() => {
                    onSelect(customer);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent dark:text-white/80 dark:hover:bg-white/[0.06]',
                    selected && 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/12 dark:text-white',
                  )}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground dark:text-white/35" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{customer.name}</span>
                    {customer.customerNumber && (
                      <span className="block truncate text-[11px] text-muted-foreground dark:text-white/35">{customer.customerNumber}</span>
                    )}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-300" />}
                </button>
              );
            })}

            {isFetching && customers.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('common.loading', 'Wird geladen...')}
              </div>
            )}

            {!isFetching && isError && (
              <p className="py-6 text-center text-xs text-destructive">
                {t('crm.contacts.customerLoadError', 'Kunden konnten nicht geladen werden')}
              </p>
            )}

            {!isFetching && !isError && customers.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {debouncedSearch.length >= 2
                  ? t('crm.contacts.noCustomersFound', 'Keine Kunden gefunden')
                  : t('crm.contacts.noCustomersAvailable', 'Keine Kunden verfügbar')}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
