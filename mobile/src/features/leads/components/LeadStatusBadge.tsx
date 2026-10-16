import {
  BadgeCheck,
  CircleCheck,
  CircleOff,
  PhoneCall,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';

import type { LeadStatus } from '../types';

// Same mapping as the web (client/src/modules/leads/ui/status-badge.tsx):
// every status has its own colour, icon and label.
export const LEAD_STATUS_META: Record<LeadStatus, { icon: LucideIcon; variant: BadgeVariant }> = {
  new: { icon: Sparkles, variant: 'primary' },
  contacted: { icon: PhoneCall, variant: 'info' },
  qualified: { icon: BadgeCheck, variant: 'success' },
  unqualified: { icon: CircleOff, variant: 'muted' },
  converted: { icon: CircleCheck, variant: 'success' },
};

export function LeadStatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const { t } = useTranslation();
  const meta = LEAD_STATUS_META[status];
  return (
    <AppBadge
      label={t(`leads.status.${status}`)}
      variant={meta.variant}
      icon={meta.icon}
      className={className}
    />
  );
}
