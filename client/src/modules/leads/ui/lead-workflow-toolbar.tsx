'use client';

import Link from 'next/link';
import { CalendarClock, Settings2, Siren } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useFollowUpSummary, useLeadWorkflowRealtime, viewerTimezone } from '../hooks/use-lead-workflow';
import { Button, useLanguage } from './lead-ui-kit';
import { AssignmentPolicyDialog } from './assignment-policy-dialog';

/**
 * Leads toolbar additions: "response overdue" quick filter, the follow-up
 * inbox (with my overdue count) and — for lead:assign-policy — the
 * assignment / SLA / escalation settings.
 */
export function LeadWorkflowToolbar({ overdueOnly, onOverdueOnlyChange, policyOpen, onPolicyOpenChange }: {
  overdueOnly: boolean;
  onOverdueOnlyChange: (value: boolean) => void;
  policyOpen: boolean;
  onPolicyOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  useLeadWorkflowRealtime();
  const summary = useFollowUpSummary('mine', viewerTimezone());
  const overdue = summary.data?.overdue ?? 0;
  const canPolicy = hasPermission('lead:assign-policy');
  return (
    <>
      <Button
        variant="outline"
        className={cn('h-9 gap-2', overdueOnly && 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300')}
        aria-label={t('leads.sla.filterOverdue')}
        aria-pressed={overdueOnly}
        onClick={() => onOverdueOnlyChange(!overdueOnly)}
      >
        <Siren className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t('leads.sla.filterOverdue', 'Response overdue')}</span>
      </Button>
      <Button asChild variant="outline" className="h-9 gap-2">
        <Link aria-label={t('leads.followUps.title')} href="/leads/follow-ups">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('leads.followUps.title', 'Follow-ups')}</span>
          {overdue > 0 && (
            <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white" aria-label={t('leads.followUps.overdueCount', '{count} overdue', { count: overdue })}>
              {overdue}
            </span>
          )}
        </Link>
      </Button>
      {canPolicy && (
        <>
          <Button aria-label={t('leads.policy.open')} variant="outline" className="h-9 gap-2" onClick={() => onPolicyOpenChange(true)}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('leads.policy.open', 'Assignment & SLA')}</span>
          </Button>
          <AssignmentPolicyDialog open={policyOpen} onOpenChange={onPolicyOpenChange} />
        </>
      )}
    </>
  );
}
