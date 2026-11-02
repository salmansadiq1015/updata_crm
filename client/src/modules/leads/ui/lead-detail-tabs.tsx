'use client';

import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'radix-ui';
import { Bot, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, useLanguage } from './lead-ui-kit';

export function LeadDetailTabs({ items, value }: { items: string[][]; value: string }) {
  const { t, isRTL } = useLanguage();
  const listRef = useRef<HTMLDivElement>(null);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-state="active"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const offset = Math.abs(list.scrollLeft);
      setCanPrevious(offset > 1);
      setCanNext(offset + list.clientWidth < list.scrollWidth - 1);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(list);
    Array.from(list.children).forEach(child => observer?.observe(child));
    list.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      list.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [items]);

  const scroll = (direction: number) => {
    const list = listRef.current;
    list?.scrollBy({ left: direction * (isRTL ? -1 : 1) * list.clientWidth * 0.7, behavior: 'smooth' });
  };

  return (
    <div className="sticky top-0 z-10 -mx-1 flex items-center gap-1 border-b border-border/60 bg-background/95 px-1 pt-1 backdrop-blur-md">
      <Tabs.List ref={listRef} aria-label={t('leads.drawer.tabs', 'Lead detail sections')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(([value, label]) => (
          <Tabs.Trigger
            key={value}
            value={value}
            onFocus={event => event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })}
            className="relative inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-t-lg px-3 py-3 text-xs font-medium text-muted-foreground transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:after:opacity-100"
          >
            {value === 'calls' && <Bot className="size-3.5" aria-hidden="true" />}
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {(canPrevious || canNext) && (
        <div className="flex shrink-0 items-center gap-0.5 border-s border-border/60 ps-1">
          <Button type="button" variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label={t('leads.drawer.previousSections', 'Previous lead sections')} disabled={!canPrevious} onClick={() => scroll(-1)}><ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label={t('leads.drawer.moreSections', 'More lead sections')} disabled={!canNext} onClick={() => scroll(1)}><ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden="true" /></Button>
        </div>
      )}
    </div>
  );
}
