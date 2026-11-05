'use client';
import { useState } from 'react';
import { Download, Loader2, PhoneForwarded } from 'lucide-react';
import { downloadBlob } from '@/lib/api/download';
import { showError } from '@/lib/toast';
import { useIntelT } from '../hooks/use-intel-t';
import { useCampaignFollowUpSummary } from '../hooks/use-follow-up-calling';
import { followUpCallingApi } from '../services/follow-up-calling-api';
import { reasonLabel } from './agent-follow-up-automation';

/**
 * Campaign-level follow-up analytics: every follow-up this campaign's calls produced, across all
 * rounds (AI-managed and handed to people), with the follow-up calls' real results and a CSV export.
 */
export function CampaignFollowUpsPanel({ campaignId }: { campaignId: string }) {
  const t = useIntelT();
  const { data, isLoading, isError } = useCampaignFollowUpSummary(campaignId);
  const [exporting, setExporting] = useState(false);
  const pct = (n?: number) => (n == null ? '—' : `${Math.round(n * 100)}%`);
  const exportCsv = async () => {
    setExporting(true);
    try { downloadBlob(await followUpCallingApi.exportCsv({ campaignId }), `ai-follow-ups-campaign-${campaignId}.csv`, 'text/csv;charset=utf-8'); }
    catch (e) { showError(e); } finally { setExporting(false); }
  };
  if (isLoading) return <p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t('aiFollowUp.loading', 'Loading…')}</p>;
  if (isError || !data) return <p role="alert" className="p-4 text-sm text-rose-300">{t('aiFollowUp.campaign.error', 'Follow-up analytics could not be loaded.')}</p>;
  const metrics: Array<[string, string | number]> = [
    [t('aiFollowUp.campaign.total', 'Follow-ups created'), data.total],
    [t('aiFollowUp.kpi.scheduled', 'Scheduled'), data.scheduled],
    [t('aiFollowUp.kpi.inProgress', 'In progress'), data.inProgress],
    [t('aiFollowUp.kpi.completed', 'Completed'), data.completed],
    [t('aiFollowUp.kpi.needsPerson', 'Needs a person'), data.requiresHuman],
    [t('aiFollowUp.campaign.callbacks', 'Callback requests'), data.callbacks],
    [t('aiFollowUp.campaign.attempts', 'Follow-up calls'), data.attempts],
    [t('aiFollowUp.kpi.answerRate', 'Answer rate'), data.attempts ? pct(data.answerRate) : '—'],
    [t('aiFollowUp.kpi.qualified', 'Qualified on follow-up'), data.qualified],
    [t('aiFollowUp.campaign.avgAttempts', 'Calls per lead'), data.attempts ? data.avgAttemptsPerLead : '—'],
    [t('aiFollowUp.campaign.cost', 'Follow-up call cost'), data.attempts ? `$${data.totalCost.toFixed(2)}` : '—'],
    [t('aiFollowUp.campaign.costPerQualified', 'Cost per qualified lead'), data.qualified ? `$${data.costPerQualified.toFixed(2)}` : '—'],
  ];
  const outcomes = Object.entries(data.byOutcome || {}).sort((a, b) => b[1] - a[1]);
  return <div className="space-y-4 p-1">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><PhoneForwarded aria-hidden className="size-4 text-primary" />{t('aiFollowUp.campaign.title', 'Follow-ups from this campaign')}</h3>
      <button type="button" className="updata-agent-secondary" disabled={exporting || !data.total} onClick={() => void exportCsv()}>
        {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}{t('aiFollowUp.queue.export', 'Export CSV')}
      </button>
    </div>
    {!data.total ? <p className="text-sm text-muted-foreground">{t('aiFollowUp.campaign.empty', 'No follow-ups yet. They appear here when a lead from this campaign asks for a callback or needs another conversation.')}</p> : <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-xl border border-border p-3">
        <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
      {outcomes.length > 0 && <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">{t('aiFollowUp.campaign.outcomes', 'Follow-up call outcomes')}</h4>
        <ul className="flex flex-wrap gap-2">{outcomes.map(([code, n]) => <li key={code} className="rounded-full border border-border px-2.5 py-1 text-xs">{reasonLabel(t, code)} · <span className="tabular-nums">{n}</span></li>)}</ul>
      </div>}
    </>}
  </div>;
}
