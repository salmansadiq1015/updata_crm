'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { ArrowRight, Building2, Search, User, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Merge "source" customer into "target" customer.
 * All contacts, sites, and installations of source are reassigned to target.
 * Source is archived with a mergedIntoId pointer (audit-safe).
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
      <DialogContent className="sm:max-w-xl p-0 gap-0 flex flex-col max-h-[92vh] rounded-2xl border border-white/8 bg-[#0D1117] shadow-2xl">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-white/6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-white/90">
                {t('crm.mergeCustomerTitle', 'Merge customers')}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-white/45 mt-0.5">
                {t(
                  'crm.mergeCustomerDesc',
                  'All contacts, sites, and installations of the source customer will be reassigned to the target customer. The source is archived.',
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin space-y-5">
          {/* Direction preview */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center rounded-xl border border-white/6 bg-white/2 p-4">
            <MergeCustomerCard customer={source} labelKey="crm.sourceCustomer" fallback="Source" tone="muted" t={t} />
            <ArrowRight className="h-5 w-5 text-white/30" aria-hidden />
            <MergeCustomerCard customer={target} labelKey="crm.targetCustomer" fallback="Target" tone="primary" t={t} empty={t('crm.mergeTargetEmpty', 'Pick a target below')} />
          </div>

          {/* Search */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-white/35 block">
              {t('crm.mergeSearchLabel', 'Find target customer')}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('crm.mergeSearchPlaceholder', 'Search by name or customer number...')}
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-white/10 bg-white/4 text-[13px] text-white/90 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
              />
            </div>

            {debounced.length >= 2 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/8 bg-[#0B0F18]">
                {isFetching ? (
                  <div className="px-3 py-4 text-[13px] text-white/40 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('common.loading', 'Loading...')}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-4 text-[13px] text-white/40">
                    {t('common.noResults', 'No results')}
                  </div>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => setTarget(c)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 text-[13px] hover:bg-white/5 border-b border-white/5 last:border-b-0 flex items-center gap-2 transition-colors',
                        target?._id === c._id && 'bg-violet-500/10 text-violet-300',
                      )}
                    >
                      {c.type === 'business'
                        ? <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        : <User className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                      <span className="truncate text-white/80">{c.name}</span>
                      {c.customerNumber && (
                        <span className="ml-auto font-mono text-[10px] text-white/35">{c.customerNumber}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="px-6 py-4 border-t border-white/6 shrink-0 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="text-white/55 hover:text-white/80 hover:bg-white/5"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canMerge || loading}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? t('common.merging', 'Merging...') : t('crm.mergeConfirm', 'Merge')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MergeCustomerCard({ customer, labelKey, fallback, tone, t, empty }) {
  if (!customer) {
    return (
      <div className="rounded-lg border-2 border-dashed border-white/10 bg-white/2 p-3 text-xs text-white/30 min-h-[78px] flex flex-col justify-center">
        <span className="uppercase tracking-wider text-[10px] font-semibold text-white/25">
          {t(labelKey, fallback)}
        </span>
        <span className="mt-1 italic">{empty}</span>
      </div>
    );
  }

  const Icon = customer.type === 'business' ? Building2 : User;

  return (
    <div className={cn(
      'rounded-lg border bg-white/2 p-3',
      tone === 'primary' ? 'border-violet-500/40 ring-1 ring-violet-500/20' : 'border-white/8',
    )}>
      <span className="uppercase tracking-wider text-[10px] font-semibold text-white/35">
        {t(labelKey, fallback)}
      </span>
      <div className="mt-1 flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', customer.type === 'business' ? 'text-emerald-400' : 'text-blue-400')} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-white/80 truncate">{customer.name}</div>
          {customer.customerNumber && (
            <div className="font-mono text-[10px] text-white/35">{customer.customerNumber}</div>
          )}
        </div>
      </div>
    </div>
  );
}
