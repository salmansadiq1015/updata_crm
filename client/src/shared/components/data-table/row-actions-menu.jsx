'use client';

import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Reusable 3-dot row action menu.
 *
 * items: Array<{
 *   type?: 'separator' | 'label',    // layout hints
 *   label?: string,
 *   icon?: LucideIcon,
 *   onSelect?: () => void,
 *   destructive?: boolean,
 *   disabled?: boolean,
 *   hidden?: boolean,                 // use for permission gating
 * }>
 */
export function RowActionsMenu({ items = [], label, align = 'end' }) {
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  return (
    // Non-modal: a row-actions menu shouldn't trap focus or lock scroll. In modal
    // mode Radix sets `pointer-events: none` on <body> while open and only restores
    // it on close — if the row remounts (table re-render) while the menu is open,
    // that cleanup never runs and the whole page stays frozen/unclickable.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg data-[state=open]:bg-muted"
          aria-label="Row actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        {label && (
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </DropdownMenuLabel>
        )}
        {visible.map((item, idx) => {
          if (item.type === 'separator') return <DropdownMenuSeparator key={`sep-${idx}`} />;
          if (item.type === 'label') {
            return (
              <DropdownMenuLabel key={`label-${idx}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {item.label}
              </DropdownMenuLabel>
            );
          }
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={`${item.label}-${idx}`}
              disabled={item.disabled}
              onSelect={(e) => {
                e.preventDefault();
                item.onSelect?.();
              }}
              className={cn(
                'gap-2 cursor-pointer',
                item.destructive && 'text-destructive focus:text-destructive focus:bg-destructive/10',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              <span className="flex-1">{item.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
