'use client';

import {
  ArrowUpRight,
  Eye,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  Star,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Lead } from '../../types/lead-types';
import { LeadStatusBadge } from '../status-badge';
import { Button, useLanguage } from '../lead-ui-kit';
import { getLeadSourceLabel, getLeadTypeLabel } from '../lead-ui-constants';
import {
  findUser,
  getAddressLines,
  getLeadBusinessTypeLabel,
  getUserDisplayName,
  getWebsiteLabel,
  mapsUrlForLead,
  toMailtoHref,
  toSafeWebUrl,
  toTelHref,
  toWhatsAppHref,
} from '../lead-ui-utils';
import type { LeadUser } from '../lead-ui-utils';

type QuickAction = {
  key: string;
  icon: LucideIcon;
  label: string;
  href: string;
  external?: boolean;
  tone?: 'default' | 'whatsapp';
};

export function LeadMapPreviewCard({
  lead,
  users,
  canWrite,
  onClose,
  onView,
  onEdit,
  className,
}: {
  lead: Lead;
  users: readonly LeadUser[];
  canWrite: boolean;
  onClose: () => void;
  onView: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  className?: string;
}) {
  const { t } = useLanguage();
  const assignee = findUser(users, lead.assignedTo);
  const addressLines = getAddressLines(lead.address);
  const category = getLeadBusinessTypeLabel(lead);
  const rating = lead.providerMeta.rating;

  const tel = toTelHref(lead.phone ?? lead.mobile);
  const mail = toMailtoHref(lead.email);
  const wa = toWhatsAppHref(lead.phone ?? lead.mobile);
  const web = toSafeWebUrl(lead.website);
  // Prefer the stored provider place link (opens the actual business) over a bare
  // coordinate pin, matching the detail drawer. A raw coordinate pin can land off
  // the business — the stored Maps URL resolves to the place itself.
  const directions = mapsUrlForLead(lead);

  // Only actions whose data actually exists are shown — no dead buttons.
  const actions: QuickAction[] = [];
  if (tel) actions.push({ key: 'call', icon: Phone, label: t('leads.map.action.call', 'Call'), href: tel });
  if (mail) actions.push({ key: 'email', icon: Mail, label: t('leads.map.action.email', 'Email'), href: mail });
  if (wa) {
    actions.push({ key: 'whatsapp', icon: MessageCircle, label: t('leads.map.action.whatsapp', 'WhatsApp'), href: wa, external: true, tone: 'whatsapp' });
  }
  if (web) actions.push({ key: 'website', icon: Globe, label: t('leads.map.action.website', 'Open website'), href: web, external: true });
  if (directions) {
    actions.push({ key: 'directions', icon: Navigation, label: t('leads.map.action.directions', 'Get directions'), href: directions, external: true });
  }

  return (
    <div
      role="dialog"
      aria-label={t('leads.map.preview.label', 'Lead preview')}
      className={cn(
        'pointer-events-auto flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-theme-lg animate-in fade-in slide-in-from-bottom-2 sm:w-[340px]',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-border p-3.5">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{lead.name}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <LeadStatusBadge status={lead.status} size="sm" />
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {getLeadTypeLabel(t, lead.type)}
            </span>
            {category ? (
              <span className="max-w-[140px] truncate rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title={category}>
                {category}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
          className="-me-1 -mt-1 shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Details */}
      <div className="space-y-2 p-3.5 text-[12px]">
        {addressLines.length > 0 ? (
          <div className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
            <span className="min-w-0">{addressLines.join(', ')}</span>
          </div>
        ) : null}

        {lead.phone || lead.mobile ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
            <span className="truncate" dir="ltr">{lead.phone ?? lead.mobile}</span>
          </div>
        ) : null}

        {lead.email ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
            <span className="truncate">{lead.email}</span>
          </div>
        ) : null}

        {web ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
            <a href={web} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
              {getWebsiteLabel(lead)}
            </a>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11px] text-muted-foreground">
          {typeof rating === 'number' ? (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
              {typeof lead.providerMeta.reviewCount === 'number' ? <span>({lead.providerMeta.reviewCount})</span> : null}
            </span>
          ) : null}
          <span>{getLeadSourceLabel(t, lead.source)}</span>
          {assignee ? <span className="truncate">· {getUserDisplayName(assignee)}</span> : null}
          {lead.leadNumber ? <span className="ms-auto font-mono text-[10px]">{lead.leadNumber}</span> : null}
        </div>
      </div>

      {/* Quick actions */}
      {actions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3.5 py-2.5">
          {actions.map(({ key, icon: Icon, label, href, external, tone }) => (
            <a
              key={key}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              title={label}
              aria-label={label}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                tone === 'whatsapp'
                  ? 'hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400'
                  : 'hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : null}

      {/* Primary actions */}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Button size="sm" className="h-8 flex-1 gap-1.5" onClick={() => onView(lead)}>
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {t('leads.map.action.view', 'View lead')}
          <ArrowUpRight className="h-3 w-3 opacity-70" aria-hidden="true" />
        </Button>
        {canWrite ? (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onEdit(lead)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {t('common.edit', 'Edit')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
