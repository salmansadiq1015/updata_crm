'use client';

import { AlertCircle, Clock3, PhoneCall, RefreshCw } from 'lucide-react';
import { useCampaignRunStatus } from '../hooks/use-ai-calling';
import type { Campaign } from '../types/ai-calling-types';
import { deviceWaitSentence } from './paired-call-health';

/** Visible on every tab: simulation and browser tests never imply a SIM dial. */
export function CampaignCallingStatus({ campaign }: { campaign: Campaign }) {
  const isVoice = campaign.channel !== 'web_link';
  const { data, isError, refetch, isFetching } = useCampaignRunStatus(campaign._id, isVoice);
  if (!isVoice) return null;
  const terminal = ['completed', 'cancelled', 'failed'].includes(campaign.status);
  const immediate = (data?.runMode || campaign.runMode) === 'immediate';
  const waits = (data?.waits || []).filter(wait => !immediate || !['calling_hours', 'recipient_quiet_hours'].includes(wait.code));
  const issue = !terminal ? data?.blockers?.[0] || waits[0] : null;
  const title = terminal ? campaign.status === 'completed' ? 'Campaign finished' : 'Calling stopped'
    : campaign.status === 'paused' ? 'Calling is paused'
      : campaign.status === 'draft' ? 'Ready when you are'
        : campaign.status === 'scheduled' ? 'Calling is scheduled'
          : data?.inProgress ? 'A call is in progress' : issue ? 'Waiting to call' : 'Calling queue is active';
  const timezone = campaign.schedule.timezone || 'UTC';
  const sequential = campaign.transport === 'paired_phone' || (campaign.schedule.maxConcurrency || 1) === 1;
  const nextAt = data?.nextAt && !Number.isNaN(Date.parse(data.nextAt)) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(data.nextAt)) : null;
  const phoneWait = waits.find(w => w.code === 'phone_wait');
  return <section aria-label="Campaign calling status" className="space-y-2 rounded-xl border border-border bg-background/50 p-3 text-xs">
    <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 font-semibold"><PhoneCall className="h-4 w-4 text-brand-500" aria-hidden="true" />{title}</p>
      <button type="button" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh calling status" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" /></button></div>
    <p className="text-muted-foreground">{terminal ? 'Review the recipients and call history below. Completed leads are not called again.' : ['draft', 'paused'].includes(campaign.status) ? 'Start calling begins immediately. Choose Start on schedule to use saved calling hours.' : sequential ? 'Each call finishes before the next begins. Pause calling stops new calls and lets the current call finish.' : `This campaign allows ${campaign.schedule.maxConcurrency} simultaneous calls. Pause and Start calling to switch to one at a time.`}</p>
    {immediate && !terminal && <p className="text-emerald-600 dark:text-emerald-400">Immediate calling · no waiting for calling hours. Connection checks, consent, retry delays and call limits still apply.</p>}
    {issue && <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{issue.message}</p>}
    {phoneWait?.reasons?.length ? <p className="text-muted-foreground">{deviceWaitSentence(phoneWait.reasons).text}</p> : null}
    {isError && <p role="alert" className="text-amber-700 dark:text-amber-300">Could not check the calling service. Refresh status before starting; no call is made by this check.</p>}
    {data && !terminal && <p className="text-muted-foreground">{data.pending} lead{data.pending === 1 ? '' : 's'} waiting · {data.inProgress} in progress</p>}
    {!immediate && <p className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Calling hours: {campaign.schedule.callWindow?.start || '09:00'}–{campaign.schedule.callWindow?.end || '18:00'} · {timezone}</p>}
    {nextAt && !terminal && waits.some(w => ['calling_hours', 'scheduled'].includes(w.code)) && <p className="text-muted-foreground">Next permitted opening: {nextAt} ({timezone}). Recipient quiet hours may defer individual leads.</p>}
    {campaign.executionEndsAt && <p className="text-muted-foreground">Stops starting new calls: {new Date(campaign.executionEndsAt).toLocaleString(undefined, { timeZone: timezone })} ({timezone}). Active calls can finish.</p>}
    {campaign.isTest && <p className="text-muted-foreground">Test campaign: Start calling places real phone calls; lead records stay unchanged. Simulate and Live test use your browser.</p>}
  </section>;
}
