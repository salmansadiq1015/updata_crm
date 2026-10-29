'use client';

import { Building2, MapPin, Phone, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/formatters';
import type { Lead } from '../types/lead-types';
import { useLanguage } from './lead-ui-kit';
import { LEAD_SOURCE_ICON, getLeadDiscoveredAt, getLeadSourceLabel } from './lead-ui-constants';
import { formatAddressOneLine, formatLeadDate, getLeadBusinessTypeLabel } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';
import { LeadStatusBadge } from './status-badge';
import { LeadSlaBadge } from './lead-sla-badge';
import { AssigneeLabel } from './lead-table-columns';
import { LtrText } from './ltr-text';
import { RatingStars } from './rating-stars';

type LeadCardProps = {
  lead: Lead;
  users: readonly LeadUser[];
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (lead: Lead) => void;
};

/** Grid-view counterpart of a table row. */
export function LeadCard({ lead, users, selected, onToggleSelect, onOpen }: LeadCardProps) {
  const { t, locale } = useLanguage();
  const address = formatAddressOneLine(lead.address);
  const businessType = getLeadBusinessTypeLabel(lead);
  const phone = lead.phone ?? lead.mobile;
  const TypeIcon = lead.type === 'business' ? Building2 : User;
  const SourceIcon = LEAD_SOURCE_ICON[lead.source];

  return (
    <article
      data-selected={selected || undefined}
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40',
        selected ? 'border-primary/50 bg-primary/5' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(lead.id)}
          aria-label={t('leads.selectLead', 'Select {name}', { name: lead.name })}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2">
            <TypeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onOpen(lead)}
              className="block min-w-0 rounded-sm text-start text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="line-clamp-2 break-words">{lead.name || '—'}</span>
            </button>
          </div>
          {businessType && (
            <p className="truncate text-[12px] font-medium text-muted-foreground" title={businessType}>
              {businessType}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <LeadStatusBadge status={lead.status} />
            <LeadSlaBadge sla={lead.sla} />
            {lead.leadNumber && <span className="font-mono text-[11px] text-muted-foreground">{lead.leadNumber}</span>}
            {lead.providerMeta?.rating != null && (
              <span className="inline-flex items-center gap-1" title={t('leads.card.ratingTitle', 'Google rating (overall only)')}>
                <RatingStars rating={lead.providerMeta.rating} size={12} />
                <span className="text-[11px] font-medium text-foreground">{lead.providerMeta.rating.toFixed(1)}</span>
                {lead.providerMeta.reviewCount != null && (
                  <span className="text-[11px] text-muted-foreground">({lead.providerMeta.reviewCount.toLocaleString(locale)})</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      <ul className="space-y-1.5 text-[13px] text-muted-foreground">
        {address && (
          <li className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{address}</span>
          </li>
        )}
        {phone && (
          <li className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              <LtrText>{formatPhone(phone) || phone}</LtrText>
            </span>
          </li>
        )}
        {!address && !phone && <li className="text-muted-foreground/60">—</li>}
      </ul>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <SourceIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{getLeadSourceLabel(t, lead.source)}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap">{formatLeadDate(getLeadDiscoveredAt(lead), locale)}</span>
      </div>

      {lead.assignedTo && (
        <div className="-mt-1">
          <AssigneeLabel userId={lead.assignedTo} users={users} />
        </div>
      )}
    </article>
  );
}
