'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { ArrowRight, Building2, Search, User, AlertTriangle } from 'lucide-react';

/**
 * Merge "source" customer into "target" customer.
 * All contacts, sites, and installations of source are reassigned to target.
 * Source is archived with a mergedIntoId pointer (audit-safe).
 *
 * UX:
 *   1. User picks source (usually the duplicate) — pre-seeded from parent.
 *   2. User searches for target by name / number.
 *   3. Confirmation shows direction and the name of each customer.
 *   4. On confirm, `onConfirm({ sourceId, targetId })` fires and parent handles the mutation.
 */
export function CustomerMergeDialog({
  open,
  onOpenChange,
  source,
  onConfirm,
  loading = false,
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState(null);
  const debounced = useDebounce(search, 300);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setTarget(null);
    }
  }, [open]);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: queryKeys.crm.customers.search(debounced),
    queryFn: () => customerService.searchCustomers(debounced, 10),
    enabled: open && debounced.length >= 2,
    staleTime: 2 * 60 * 1000,
  });

  const filtered = useMemo(
    () => suggestions.filter((c) => c._id !== source?._id),
    [suggestions, source?._id],
  );

  const canMerge = !!source?._id && !!target?._id && source._id !== target._id;

  const handleConfirm = () => {
    if (!canMerge) return;
    onConfirm({ sourceId: source._id, targetId: target._id });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {t('crm.mergeCustomerTitle', 'Merge customers')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'crm.mergeCustomerDesc',
              'All contacts, sites, and installations of the source customer will be reassigned to the target customer. The source is archived.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Direction preview */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center rounded-lg border border-border bg-muted/30 p-4">
            <MergeCustomerCard customer={source} labelKey="crm.sourceCustomer" fallback="Source" tone="muted" t={t} />
            <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden />
            <MergeCustomerCard customer={target} labelKey="crm.targetCustomer" fallback="Target" tone="primary" t={t} empty={t('crm.mergeTargetEmpty', 'Pick a target below')} />
          </div>

          {/* Search */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('crm.mergeSearchLabel', 'Find target customer')}
            </label>
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('crm.mergeSearchPlaceholder', 'Search by name or customer number...')}
                className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/20 focus:border-ring"
              />
            </div>

            {debounced.length >= 2 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-card">
                {isFetching ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    {t('common.loading', 'Loading...')}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    {t('common.noResults', 'No results')}
                  </div>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => setTarget(c)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm hover:bg-muted/60 border-b border-border last:border-b-0 flex items-center gap-2',
                        target?._id === c._id && 'bg-primary/10',
                      )}
                    >
                      {c.type === 'business' ? <Building2 className="h-3.5 w-3.5 text-emerald-500" /> : <User className="h-3.5 w-3.5 text-blue-500" />}
                      <span className="truncate">{c.name}</span>
                      {c.customerNumber && (
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{c.customerNumber}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canMerge || loading}
          >
            {loading ? t('common.merging', 'Merging...') : t('crm.mergeConfirm', 'Merge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeCustomerCard({ customer, labelKey, fallback, tone, t, empty }) {
  if (!customer) {
    return (
      <div className={cn(
        'rounded-md border-2 border-dashed border-border/60 bg-card p-3 text-xs text-muted-foreground',
        'min-h-[78px] flex flex-col justify-center',
      )}>
        <span className="uppercase tracking-wider text-[10px] font-semibold">
          {t(labelKey, fallback)}
        </span>
        <span className="mt-1 italic">{empty}</span>
      </div>
    );
  }

  const Icon = customer.type === 'business' ? Building2 : User;

  return (
    <div className={cn(
      'rounded-md border bg-card p-3',
      tone === 'primary' ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border',
    )}>
      <span className="uppercase tracking-wider text-[10px] font-semibold text-muted-foreground">
        {t(labelKey, fallback)}
      </span>
      <div className="mt-1 flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', customer.type === 'business' ? 'text-emerald-500' : 'text-blue-500')} />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{customer.name}</div>
          {customer.customerNumber && (
            <div className="font-mono text-[10px] text-muted-foreground">{customer.customerNumber}</div>
          )}
        </div>
      </div>
    </div>
  );
}
