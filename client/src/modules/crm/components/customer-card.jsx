'use client';

import Link from 'next/link';
import { PermissionGate } from '@/shared/components/permission-gate';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getCustomerTypeLabel } from '@/modules/crm/constants/customer-constants';
import {
  Building2, User, Mail, Phone, MapPin, MoreHorizontal,
  Eye, Pencil, Copy, Archive, BellRing,
} from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { pickCustomerAccent } from '@/modules/crm/constants/customer-constants';

export function CustomerCard({ customer, onEdit, onDeactivate, t }) {
  const accent = pickCustomerAccent(customer);
  const isBusiness = customer.type === 'business';
  const Icon = isBusiness ? Building2 : User;
  const isInactive = customer.status === 'inactive';
  const address = [customer.postalCode, customer.city].filter(Boolean).join(' ');

  return (
    <div className="group relative rounded-xl border border-border bg-card overflow-hidden hover:border-border hover:shadow-theme-md transition-all duration-200">
      {/* Top accent */}
      <div className={cn('h-1 bg-linear-to-r', accent.bar)} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <Link href={`/crm/customers/${customer._id}`} className="flex items-center gap-3 min-w-0 group/link">
            <div className={cn(
              'h-11 w-11 rounded-xl flex items-center justify-center ring-1 shrink-0',
              accent.bg, accent.ring,
            )}>
              <Icon className={cn('h-5 w-5', accent.text)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm truncate group-hover/link:text-primary transition-colors">
                  {customer.name}
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                {customer.customerNumber && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {customer.customerNumber}
                  </span>
                )}
                <span className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md',
                  isBusiness
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
                )}>
                  <span className={cn('h-1 w-1 rounded-full', isBusiness ? 'bg-emerald-500' : 'bg-blue-500')} />
                  {getCustomerTypeLabel(customer.type, t)}
                </span>
              </div>
            </div>
          </Link>

          {/* Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5 -mr-1"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href={`/crm/customers/${customer._id}`} className="gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  {t('common.view', 'Anzeigen')}
                </Link>
              </DropdownMenuItem>
              <PermissionGate permission="crm:write">
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil className="h-3.5 w-3.5" />
                  {t('common.edit', 'Bearbeiten')}
                </DropdownMenuItem>
              </PermissionGate>
              {customer.email && (
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(customer.email);
                    showSuccess(t('crm.copyEmail', 'E-Mail kopiert'));
                  }}
                  className="gap-2"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t('crm.email', 'E-Mail')}
                </DropdownMenuItem>
              )}
              <PermissionGate permission="crm:delete">
                {!isInactive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={onDeactivate}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      {t('crm.deactivate', 'Deaktivieren')}
                    </DropdownMenuItem>
                  </>
                )}
              </PermissionGate>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Contact info */}
        <div className="space-y-2 min-h-[5rem]">
          {customer.email ? (
            <div className="flex items-center gap-2 text-xs">
              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                <Mail className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="truncate">{customer.email}</span>
            </div>
          ) : null}
          {(customer.phone || customer.mobile) && (
            <div className="flex items-center gap-2 text-xs">
              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                <Phone className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="truncate">{customer.phone || customer.mobile}</span>
            </div>
          )}
          {address && (
            <div className="flex items-center gap-2 text-xs">
              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                <MapPin className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="truncate text-muted-foreground">{address}{customer.canton ? ` · ${customer.canton}` : ''}</span>
            </div>
          )}
        </div>

        {/* Footer: status + newsletter */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
          <span className={cn(
            'inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full',
            isInactive
              ? 'bg-muted text-muted-foreground'
              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', isInactive ? 'bg-muted-foreground/40' : 'bg-emerald-500')} />
            {isInactive ? t('crm.statusInactive', 'Deaktiviert') : t('crm.statusActive', 'Aktiv')}
          </span>

          {customer.newsletterOptIn && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <BellRing className="h-3 w-3" />
              {t('crm.newsletter', 'Newsletter')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
