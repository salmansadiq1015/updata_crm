'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Building2, Search, User, AlertTriangle, Loader2,
  MapPin, Check,
} from 'lucide-react';

const MERGE_FIELDS = [
  { key: 'email', label: 'crm.email', fallback: 'E-Mail' },
  { key: 'phone', label: 'crm.phone', fallback: 'Telefon' },
  { key: 'mobile', label: 'crm.mobile', fallback: 'Mobile' },
  { key: 'website', label: 'crm.website', fallback: 'Website' },
  { key: 'street', label: 'crm.street', fallback: 'Strasse' },
  { key: 'addressSupplement', label: 'crm.addressSupplement', fallback: 'Adresszusatz' },
  { key: 'postalCode', label: 'crm.postalCode', fallback: 'PLZ' },
  { key: 'city', label: 'crm.city', fallback: 'Ort' },
  { key: 'canton', label: 'crm.canton', fallback: 'Kanton' },
  { key: 'ownerName', label: 'crm.ownerName', fallback: 'Inhaber' },
  { key: 'vatNumber', label: 'crm.vatNumber', fallback: 'MwSt-Nr.' },
  { key: 'uidNumber', label: 'crm.uidNumber', fallback: 'UID' },
];

function val(obj, key) {
  return (obj?.[key] || '').toString().trim();
}

/**
 * Merge "source" customer into "target" customer.
 * Shows a field-level comparison so the user can pick which values to keep
 * when both records have different data for the same field.
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
  const [choices, setChoices] = useState({});
  const [mergeNotes, setMergeNotes] = useState(true);
  const debounced = useDebounce(search, 300);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setTarget(null);
      setChoices({});
      setMergeNotes(true);
    }
  }, [open]);

  // Compute field differences when source and target are set
  const fieldDiffs = useMemo(() => {
    if (!source || !target) return [];
    return MERGE_FIELDS.map((f) => {
      const sv = val(source, f.key);
      const tv = val(target, f.key);
      if (!sv) return null;
      if (sv === tv) return null;
      return { ...f, sourceValue: sv, targetValue: tv, hasConflict: !!tv };
    }).filter(Boolean);
  }, [source, target]);

  // Both have notes?
  const bothHaveNotes = !!(val(source, 'notes') && val(target, 'notes') && val(source, 'notes') !== val(target, 'notes'));
  const sourceOnlyNotes = !!(val(source, 'notes') && !val(target, 'notes'));

  // Initialize choices when diffs change
  useEffect(() => {
    const init = {};
    for (const diff of fieldDiffs) {
      // Conflicts: default to target (existing behavior). Source-only: default to source (carry over).
      init[diff.key] = diff.hasConflict ? 'target' : 'source';
    }
    setChoices(init);
    setMergeNotes(true);
  }, [fieldDiffs]);

  const toggleChoice = useCallback((key) => {
    setChoices((prev) => ({
      ...prev,
      [key]: prev[key] === 'source' ? 'target' : 'source',
    }));
  }, []);

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

    // Build fieldOverrides: only include fields where user chose the source value
    const fieldOverrides = {};
    for (const diff of fieldDiffs) {
      if (choices[diff.key] === 'source') {
        fieldOverrides[diff.key] = source[diff.key];
      }
    }

    // Notes: concatenate if both have notes and user chose to merge
    if (bothHaveNotes && mergeNotes) {
      fieldOverrides.notes = `${target.notes}\n\n--- ${source.name} ---\n${source.notes}`;
    } else if (sourceOnlyNotes) {
      fieldOverrides.notes = source.notes;
    }

    onConfirm({ sourceId: source._id, targetId: target._id, fieldOverrides });
  };

  const hasFieldDiffs = fieldDiffs.length > 0 || bothHaveNotes || sourceOnlyNotes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 flex flex-col max-h-[92vh] rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-foreground">
                {t('crm.mergeCustomerTitle', 'Kunden zusammenführen')}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">
                {t(
                  'crm.mergeCustomerDesc',
                  'Alle Kontakte, Objekte und Anlagen des Quellkunden werden dem Zielkunden zugewiesen. Der Quellkunde wird archiviert.',
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin space-y-5">
          {/* Direction preview */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center rounded-xl border border-border bg-muted/30 p-4">
            <MergeCustomerCard customer={source} labelKey="crm.sourceCustomer" fallback="Quellkunde" tone="muted" t={t} />
            <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden />
            <MergeCustomerCard customer={target} labelKey="crm.targetCustomer" fallback="Zielkunde" tone="primary" t={t} empty={t('crm.mergeTargetEmpty', 'Zielkunde unten auswählen')} />
          </div>

          {/* Search */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
              {t('crm.mergeSearchLabel', 'Zielkunde suchen')}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('crm.mergeSearchPlaceholder', 'Name, Nummer oder Ort...')}
                className="h-9 pl-9 pr-3 rounded-xl bg-muted/50 border-border text-[13px]"
              />
            </div>

            {debounced.length >= 2 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-card">
                {isFetching ? (
                  <div className="px-3 py-4 text-[13px] text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('common.loading', 'Wird geladen...')}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-4 text-[13px] text-muted-foreground">
                    {t('common.noResults', 'Keine Ergebnisse')}
                  </div>
                ) : (
                  filtered.map((c) => {
                    const locality = [c.postalCode, c.city].filter(Boolean).join(' ');
                    return (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => setTarget(c)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 text-[13px] hover:bg-muted/60 border-b border-border last:border-b-0 flex items-center gap-2 transition-colors',
                          target?._id === c._id && 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
                        )}
                      >
                        {c.type === 'business'
                          ? <Building2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          : <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                        <span className="truncate text-foreground">{c.name}</span>
                        {locality && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                            <MapPin className="h-3 w-3" />
                            {locality}
                          </span>
                        )}
                        {c.customerNumber && (
                          <span className="ml-auto font-mono text-[10px] text-muted-foreground shrink-0">{c.customerNumber}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Field resolution */}
          {target && hasFieldDiffs && (
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                {t('crm.mergeFieldResolution', 'Datenabgleich')}
              </label>
              <p className="text-[12px] text-muted-foreground">
                {t('crm.mergeFieldResolutionDesc', 'Wählen Sie für jedes Feld, welcher Wert übernommen werden soll.')}
              </p>
              <div className="rounded-xl border border-border overflow-hidden">
                {fieldDiffs.map((diff) => (
                  <FieldRow
                    key={diff.key}
                    label={t(diff.label, diff.fallback)}
                    sourceValue={diff.sourceValue}
                    targetValue={diff.targetValue}
                    hasConflict={diff.hasConflict}
                    choice={choices[diff.key] || 'target'}
                    onToggle={() => toggleChoice(diff.key)}
                    t={t}
                  />
                ))}
                {(bothHaveNotes || sourceOnlyNotes) && (
                  <div className="px-3 py-2.5 border-t border-border bg-muted/10">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-foreground">
                        {t('crm.notes', 'Notizen')}
                      </span>
                      {bothHaveNotes ? (
                        <button
                          type="button"
                          onClick={() => setMergeNotes((prev) => !prev)}
                          className={cn(
                            'flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md transition-colors',
                            mergeNotes
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          <Check className={cn('h-3 w-3', mergeNotes ? 'opacity-100' : 'opacity-0')} />
                          {t('crm.mergeNotesCombine', 'Beide zusammenführen')}
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <ArrowRight className="h-3 w-3" />
                          {t('crm.mergeNotesCarryOver', 'Wird übernommen')}
                        </span>
                      )}
                    </div>
                    {bothHaveNotes && (
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <p className="text-[11px] text-muted-foreground line-clamp-2 rounded bg-muted/40 px-2 py-1">
                          {val(source, 'notes').slice(0, 120)}{val(source, 'notes').length > 120 ? '...' : ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 rounded bg-muted/40 px-2 py-1">
                          {val(target, 'notes').slice(0, 120)}{val(target, 'notes').length > 120 ? '...' : ''}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            {t('common.cancel', 'Abbrechen')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canMerge || loading}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? t('common.merging', 'Zusammenführen...') : t('crm.mergeConfirm', 'Zusammenführen')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ label, sourceValue, targetValue, hasConflict, choice, onToggle, t }) {
  return (
    <div className="px-3 py-2 border-b border-border last:border-b-0 bg-muted/10">
      <div className="text-[11px] font-medium text-muted-foreground mb-1">{label}</div>
      {hasConflict ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => choice !== 'source' && onToggle()}
            className={cn(
              'text-left px-2.5 py-1.5 rounded-lg text-[12px] border transition-all',
              choice === 'source'
                ? 'border-violet-500/50 bg-violet-500/10 text-foreground ring-1 ring-violet-500/20'
                : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted/80',
            )}
          >
            <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground block mb-0.5">
              {t('crm.sourceCustomer', 'Quellkunde')}
            </span>
            <span className="truncate block">{sourceValue}</span>
          </button>
          <button
            type="button"
            onClick={() => choice !== 'target' && onToggle()}
            className={cn(
              'text-left px-2.5 py-1.5 rounded-lg text-[12px] border transition-all',
              choice === 'target'
                ? 'border-violet-500/50 bg-violet-500/10 text-foreground ring-1 ring-violet-500/20'
                : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted/80',
            )}
          >
            <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground block mb-0.5">
              {t('crm.targetCustomer', 'Zielkunde')}
            </span>
            <span className="truncate block">{targetValue}</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0">
            <ArrowRight className="h-3 w-3" />
          </span>
          <span className="truncate text-foreground">{sourceValue}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            ({t('crm.mergeCarryOver', 'wird übernommen')})
          </span>
        </div>
      )}
    </div>
  );
}

function MergeCustomerCard({ customer, labelKey, fallback, tone, t, empty }) {
  if (!customer) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground min-h-[78px] flex flex-col justify-center">
        <span className="uppercase tracking-wider text-[10px] font-semibold text-muted-foreground/70">
          {t(labelKey, fallback)}
        </span>
        <span className="mt-1 italic">{empty}</span>
      </div>
    );
  }

  const Icon = customer.type === 'business' ? Building2 : User;
  const locality = [customer.postalCode, customer.city].filter(Boolean).join(' ');

  return (
    <div className={cn(
      'rounded-lg border p-3',
      tone === 'primary' ? 'border-violet-500/40 ring-1 ring-violet-500/20 bg-violet-500/5' : 'border-border bg-muted/30',
    )}>
      <span className="uppercase tracking-wider text-[10px] font-semibold text-muted-foreground">
        {t(labelKey, fallback)}
      </span>
      <div className="mt-1 flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', customer.type === 'business' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400')} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{customer.name}</div>
          <div className="flex items-center gap-2">
            {customer.customerNumber && (
              <span className="font-mono text-[10px] text-muted-foreground">{customer.customerNumber}</span>
            )}
            {locality && (
              <span className="text-[10px] text-muted-foreground">{locality}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
