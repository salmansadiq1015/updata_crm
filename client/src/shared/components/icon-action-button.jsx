'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Icon-only button with built-in tooltip on hover/focus.
 *
 * Premium UX choices baked in:
 *   - Tooltip fades in after a 200 ms delay (feels responsive, not jumpy)
 *   - Focus-visible shows tooltip too (keyboard accessible)
 *   - `destructive` variant tints hover red for dangerous actions
 *   - `href` turns the button into a next/link without losing tooltip
 *   - Accepts arbitrary `variant` and `size` from shadcn/ui Button
 *
 * Props:
 *   label       required — tooltip text AND aria-label
 *   icon        LucideIcon component
 *   onClick     click handler (ignored when `href` is set)
 *   href        when present, renders as a next/link
 *   destructive boolean — applies red hover tint
 *   side        tooltip side (default: 'top')
 *   variant     shadcn Button variant (default: 'ghost')
 *   size        shadcn Button size (default: 'icon-sm')
 */
export const IconActionButton = forwardRef(function IconActionButton(
  {
    label,
    icon: Icon,
    onClick,
    href,
    destructive = false,
    disabled = false,
    side = 'top',
    variant = 'ghost',
    size = 'icon-sm',
    className,
    children,
    ...rest
  },
  ref,
) {
  const buttonEl = (
    <Button
      ref={ref}
      type={href ? undefined : 'button'}
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      asChild={!!href}
      className={cn(
        'rounded-lg transition-all duration-150',
        destructive && 'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
        className,
      )}
      {...rest}
    >
      {href ? (
        <Link href={href}>
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {children}
        </Link>
      ) : (
        <>
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {children}
        </>
      )}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{buttonEl}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={6}
          className="text-xs font-medium px-2.5 py-1.5 rounded-md shadow-theme-md animate-in fade-in-0 zoom-in-95"
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
