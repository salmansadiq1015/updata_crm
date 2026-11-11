'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, PlayCircle, Search, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { CATEGORY_ORDER, CATEGORY_STYLES, visualFor } from '../../lib/node-registry';
import type { NodeCatalogEntry, NodeCategory } from '../../types/workflow-types';

export const DND_MIME = 'application/x-updata-workflow-node';

interface Props {
  nodes: NodeCatalogEntry[];
  hasTrigger: boolean;
  onAdd: (type: string) => void;
  className?: string;
  recent?: string[];
  favorites?: string[];
  onToggleFavorite?: (type: string) => void;
  onOpenDemo?: () => void;
}

export function NodePalette({ nodes, hasTrigger, onAdd, className, recent = [], favorites = [], onToggleFavorite, onOpenDemo }: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byType = new Map(nodes.map((n) => [n.type, n]));
    const pinned = q ? [] : [
      { category: 'favorites', items: favorites.map((ty) => byType.get(ty)).filter(Boolean) as NodeCatalogEntry[] },
      { category: 'recent', items: recent.filter((ty) => !favorites.includes(ty)).map((ty) => byType.get(ty)).filter(Boolean).slice(0, 6) as NodeCatalogEntry[] },
    ];
    return [...pinned, ...CATEGORY_ORDER.map((category) => ({
      category,
      items: nodes.filter((n) => n.category === category).filter((n) => !q
        || t(`workflow.node.${n.type}.label`, n.type).toLowerCase().includes(q)
        || t(`workflow.node.${n.type}.desc`, '').toLowerCase().includes(q)),
    }))].filter((g) => g.items.length);
  }, [nodes, query, t, recent, favorites]);

  return (
    <aside className={cn('flex h-full min-h-0 flex-col', className)} aria-label={t('workflowBuilder.palette.title', 'Building blocks')}>
      <div className="space-y-3 border-b p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('workflowBuilder.palette.title', 'Building blocks')}</p>
            <p className="text-xs text-muted-foreground">{t('workflowBuilder.palette.hint', 'Drag onto the canvas or click to add')}</p>
          </div>
          {onOpenDemo && (
            <button type="button" onClick={onOpenDemo} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/[0.06] px-2 py-1 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-500/15 dark:text-sky-300"
              title={t('workflowDemo.title', 'How to build a workflow')}>
              <PlayCircle className="size-3.5" />{t('workflowBuilder.palette.demo', 'Demo')}
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('workflowBuilder.palette.search', 'Search blocks…')} className="h-9 ps-8 text-sm" aria-label={t('workflowBuilder.palette.search', 'Search blocks…')} />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {groups.map(({ category, items }) => {
          const isOpen = query ? true : !collapsed[category];
          return (
            <section key={category} className="rounded-xl">
              <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [category]: !c[category] }))} aria-expanded={isOpen}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
                <span className="flex items-center gap-2">
                  {category === 'favorites' ? <Star className="size-3 fill-amber-400 text-amber-400" /> : <span className={cn('size-1.5 rounded-full', CATEGORY_STYLES[category as NodeCategory]?.dot || 'bg-slate-400')} />}
                  {category === 'favorites' ? t('workflowBuilder.palette.favorites', 'Favorites') : category === 'recent' ? t('workflowBuilder.palette.recent', 'Recently used') : t(`workflow.category.${category}`, category)}
                </span>
                <ChevronDown className={cn('size-4 transition-transform', !isOpen && '-rotate-90 rtl:rotate-90')} aria-hidden />
              </button>
              {isOpen && (
                <div className="grid grid-cols-3 gap-1.5 px-1 pb-2 pt-1">
                  {items.map((item) => {
                    const v = visualFor(item.type);
                    const Icon = v.icon;
                    const disabled = item.category === 'trigger' && hasTrigger;
                    const label = t(`workflow.node.${item.type}.label`, item.type);
                    return (
                      <div key={`${category}-${item.type}`} className="group/tile relative">
                      {onToggleFavorite && (
                        <button type="button" onClick={() => onToggleFavorite(item.type)} aria-pressed={favorites.includes(item.type)}
                          aria-label={favorites.includes(item.type) ? t('workflowBuilder.palette.unfavorite', 'Remove from favorites') : t('workflowBuilder.palette.favorite', 'Add to favorites')}
                          className={cn('absolute end-0.5 top-0.5 z-10 rounded-md p-1 transition-opacity', favorites.includes(item.type) ? 'opacity-100' : 'opacity-0 focus:opacity-100 group-hover/tile:opacity-100')}>
                          <Star className={cn('size-3', favorites.includes(item.type) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                        </button>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            draggable={!disabled}
                            disabled={disabled}
                            data-testid={category === 'favorites' || category === 'recent' ? `palette-${category}-${item.type}` : `palette-${item.type}`}
                            onDragStart={(e) => { e.dataTransfer.setData(DND_MIME, item.type); e.dataTransfer.effectAllowed = 'move'; }}
                            onClick={() => onAdd(item.type)}
                            className={cn(
                              'group flex w-full flex-col items-center gap-1.5 rounded-xl border border-transparent px-1 py-2 text-center transition-all',
                              disabled ? 'cursor-not-allowed opacity-40' : 'cursor-grab hover:border-border hover:bg-card hover:shadow-sm active:cursor-grabbing',
                            )}
                          >
                            <span className={cn('grid size-11 place-items-center rounded-xl ring-1 ring-inset ring-black/5 transition-transform group-hover:scale-105 dark:ring-white/10', CATEGORY_STYLES[v.category].icon)}>
                              <Icon className="size-5" aria-hidden />
                            </span>
                            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground/85">{label}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-56 text-xs">
                          <p className="font-semibold">{label}</p>
                          <p className="opacity-80">{disabled ? t('workflowBuilder.palette.oneTrigger', 'A workflow has exactly one trigger.') : t(`workflow.node.${item.type}.desc`, '')}</p>
                        </TooltipContent>
                      </Tooltip>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        {!groups.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('workflowBuilder.palette.empty', 'No matching blocks')}</p>}
      </div>
    </aside>
  );
}
