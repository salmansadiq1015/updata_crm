'use client';

import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Check, ChevronsUpDown, Search, Loader2, Inbox, X } from 'lucide-react';

// A premium, searchable single-select dropdown built on Popover.
//
// option shape: { value, label, description?, icon?: Component, badge?: string, keywords?: string }
//
// Local mode (default): filters `options` client-side by the search box.
// Async mode (`async`): the parent owns filtering — pass current `options`,
// wire `onSearchChange`, and optionally `loading` for the spinner. Provide
// `selectedLabel` so the trigger can render the chosen item even when it is not
// in the currently fetched page of results.
export function Combobox({
  options = [],
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  triggerIcon: TriggerIcon,
  searchable = true,
  async = false,
  onSearchChange,
  loading = false,
  emptyIcon: EmptyIcon = Inbox,
  emptyMessage,
  emptyHint,
  noResultsMessage,
  noResultsHint,
  selectedLabel,
  disabled = false,
  allowClear = false,
  className,
  contentClassName,
  size = 'default',
  ariaLabel,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => String(o.value) === String(value)) || null;
  const triggerLabel = selectedLabel || selected?.label;
  const hasSearchQuery = query.trim().length > 0;
  const shouldShowNoResultsCopy = hasSearchQuery && noResultsMessage && (async || options.length > 0);

  const filtered = useMemo(() => {
    if (async || !searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      [o.label, o.description, o.badge, o.keywords]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [options, query, async, searchable]);

  const handleSearch = (next) => {
    setQuery(next);
    if (async) onSearchChange?.(next);
  };

  const handleSelect = (option) => {
    onChange?.(option.value, option);
    setOpen(false);
    setQuery('');
    if (async) onSearchChange?.('');
  };

  const SelectedIcon = selected?.icon;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          if (async) onSearchChange?.('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/70 text-left text-sm shadow-sm transition-colors',
            'hover:border-primary/40 hover:bg-muted/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            'disabled:cursor-not-allowed disabled:opacity-50',
            size === 'sm' ? 'h-9 px-3' : 'h-11 px-3.5',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {(SelectedIcon || TriggerIcon) && (() => {
              const Icon = SelectedIcon || TriggerIcon;
              return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
            })()}
            {triggerLabel ? (
              <span className="truncate font-medium text-foreground">{triggerLabel}</span>
            ) : (
              <span className="truncate text-muted-foreground">{placeholder || t('common.select', 'Select...')}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {allowClear && (selected || selectedLabel) && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label={t('common.clear', 'Clear')}
                onClick={(e) => { e.stopPropagation(); onChange?.('', null); }}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className={cn(
          'w-[--radix-popover-trigger-width] overflow-hidden rounded-2xl border-border/70 p-0 shadow-xl',
          contentClassName,
        )}
      >
        {searchable && (
          <div className="border-b border-border/70 bg-muted/20 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              {loading && (
                <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
              <Input
                autoFocus
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={searchPlaceholder || t('common.search', 'Search...')}
                className="h-9 rounded-lg bg-background pl-8 pr-8 text-sm"
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <div className="max-h-[280px] overflow-y-auto overscroll-contain p-1.5">
          {filtered.length > 0 ? (
            filtered.map((option) => {
              const OptIcon = option.icon;
              const isSelected = String(option.value) === String(value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
                    isSelected && 'bg-primary/10',
                  )}
                >
                  {OptIcon && <OptIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{option.label}</span>
                    {option.description && (
                      <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </span>
                  {option.badge && (
                    <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {option.badge}
                    </span>
                  )}
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center', isSelected ? 'text-primary' : 'text-transparent')}>
                    <Check className="h-4 w-4" />
                  </span>
                </button>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-9 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <EmptyIcon className="h-5 w-5" />}
              </div>
              <p className="text-sm font-medium text-foreground">
                {loading
                  ? t('common.loading', 'Loading...')
                  : (shouldShowNoResultsCopy
                    ? noResultsMessage
                    : (emptyMessage || t('common.noResults', 'No results found')))}
              </p>
              {!loading && (
                shouldShowNoResultsCopy && noResultsHint ? (
                  <p className="max-w-[220px] text-xs text-muted-foreground">{noResultsHint}</p>
                ) : emptyHint ? (
                  <p className="max-w-[220px] text-xs text-muted-foreground">{emptyHint}</p>
                ) : null
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
