'use client';

// Business-type picker: a popular grid (icons from the catalog), multi-select
// with removable chips, a "view all" grouped list, a sanitised custom-type
// input, and a free-text keyword. Selection + keyword live in the store.

import { useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
  Calculator,
  Car,
  Check,
  Coffee,
  Dumbbell,
  GraduationCap,
  Hammer,
  HardHat,
  Heart,
  Home,
  Hotel,
  Loader2,
  Microscope,
  Pill,
  Plus,
  Scale,
  Scissors,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Store,
  UtensilsCrossed,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useBusinessTypes } from '../hooks/use-discovery';
import type { BusinessType } from '../types/discovery-types';
import { useLeadGenWizard } from '../state/lead-gen-store';

const ICON_MAP: Record<string, LucideIcon> = {
  utensils: UtensilsCrossed,
  utensilscrossed: UtensilsCrossed,
  restaurant: UtensilsCrossed,
  coffee: Coffee,
  cafe: Coffee,
  hotel: Hotel,
  bed: Hotel,
  store: Store,
  shop: Store,
  shoppingbag: ShoppingBag,
  shoppingcart: ShoppingCart,
  cart: ShoppingCart,
  supermarket: ShoppingCart,
  pill: Pill,
  pharmacy: Pill,
  stethoscope: Stethoscope,
  clinic: Stethoscope,
  heart: Heart,
  heartpulse: Heart,
  scissors: Scissors,
  salon: Scissors,
  dumbbell: Dumbbell,
  gym: Dumbbell,
  car: Car,
  wrench: Wrench,
  contractor: Wrench,
  hardhat: HardHat,
  construction: HardHat,
  hammer: Hammer,
  building: Building2,
  building2: Building2,
  briefcase: Briefcase,
  scale: Scale,
  law: Scale,
  calculator: Calculator,
  accounting: Calculator,
  graduationcap: GraduationCap,
  school: GraduationCap,
  microscope: Microscope,
  laboratory: Microscope,
  home: Home,
  realestate: Home,
  sparkles: Sparkles,
};

function resolveIcon(name: string | null): LucideIcon {
  if (!name) return Store;
  return ICON_MAP[name.toLowerCase().replace(/[-_\s]/g, '')] ?? Store;
}

function sanitizeCustom(value: string): string {
  return value
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 60);
}

const POPULAR_COUNT = 12;

export function BusinessTypeGrid() {
  const { t } = useLanguage();
  const { selectedBusinessTypes, toggleBusinessType, setSelectedBusinessTypes, keyword, setKeyword } =
    useLeadGenWizard();
  const typesQuery = useBusinessTypes();
  const types = useMemo(() => typesQuery.data ?? [], [typesQuery.data]);

  const [expanded, setExpanded] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const byId = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);
  const label = (type: BusinessType) => (type.i18nKey ? t(type.i18nKey, type.name) : type.name);
  const chipLabel = (id: string) => {
    const type = byId.get(id);
    return type ? label(type) : id;
  };

  const popular = useMemo(() => types.slice(0, POPULAR_COUNT), [types]);
  const grouped = useMemo(() => {
    const groups = new Map<string, BusinessType[]>();
    for (const type of types) {
      const key = type.category ?? 'other';
      const list = groups.get(key) ?? [];
      list.push(type);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [types]);

  const addCustom = () => {
    const clean = sanitizeCustom(customValue);
    if (!clean) return;
    if (!selectedBusinessTypes.includes(clean)) {
      setSelectedBusinessTypes([...selectedBusinessTypes, clean]);
    }
    setCustomValue('');
  };

  const TypeButton = ({ type }: { type: BusinessType }) => {
    const Icon = resolveIcon(type.icon);
    const active = selectedBusinessTypes.includes(type.id);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={active}
        onClick={() => toggleBusinessType(type.id)}
        className={cn(
          'group relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active
            ? 'border-primary bg-primary/5 text-foreground'
            : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-muted/40 hover:text-foreground',
        )}
      >
        {active && (
          <span className="absolute end-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        )}
        <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
        <span className="line-clamp-2 text-xs font-medium leading-tight">{label(type)}</span>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {/* Selection chips */}
      {selectedBusinessTypes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {t('leadgen.businessType.selectedCount', '{count} selected', { count: selectedBusinessTypes.length })}
            </p>
            <button
              type="button"
              onClick={() => setSelectedBusinessTypes([])}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('leadgen.businessType.clearSelection', 'Clear selection')}
            </button>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label={t('leadgen.businessType.selected', 'Selected categories')}>
            {selectedBusinessTypes.map((id) => (
              <li key={id}>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 ps-2.5 pe-1 text-xs font-medium text-primary">
                  {chipLabel(id)}
                  <button
                    type="button"
                    onClick={() => toggleBusinessType(id)}
                    className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
                    aria-label={t('leadgen.businessType.clearSelection', 'Remove {name}', { name: chipLabel(id) })}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grid */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {expanded ? t('leadgen.businessType.all', 'All categories') : t('leadgen.businessType.popular', 'Popular categories')}
        </p>

        {typesQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          </div>
        ) : types.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {t('leadgen.businessType.empty', 'No categories available')}
          </p>
        ) : expanded ? (
          <div className="space-y-4">
            {grouped.map(([category, items]) => (
              <div key={category} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {t(`leadgen.group.${category}`, category)}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {items.map((type) => (
                    <TypeButton key={type.id} type={type} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {popular.map((type) => (
              <TypeButton key={type.id} type={type} />
            ))}
          </div>
        )}

        {types.length > POPULAR_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-xs font-medium text-primary transition-colors hover:underline"
          >
            {expanded
              ? t('leadgen.businessType.popular', 'Show popular only')
              : t('leadgen.businessType.categories', 'View all categories')}
          </button>
        )}
      </div>

      {/* Custom type */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="leadgen-custom-type">
          {t('leadgen.businessType.custom', 'Custom type')}
        </label>
        <div className="flex gap-2">
          <Input
            id="leadgen-custom-type"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCustom();
              }
            }}
            placeholder={t('leadgen.businessType.customPlaceholder', 'e.g. solar installer')}
            maxLength={60}
          />
          <Button type="button" variant="outline" onClick={addCustom} disabled={!customValue.trim()} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leadgen.businessType.customAdd', 'Add')}
          </Button>
        </div>
      </div>

      {/* Keyword */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="leadgen-keyword">
          {t('leadgen.businessType.keyword', 'Keyword (optional)')}
        </label>
        <Input
          id="leadgen-keyword"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={t('leadgen.businessType.keywordPlaceholder', 'Refine with a keyword')}
          maxLength={80}
        />
        <p className="text-[11px] text-muted-foreground">
          {t('leadgen.businessType.keywordHint', 'Narrows results to businesses matching this term.')}
        </p>
      </div>
    </div>
  );
}
