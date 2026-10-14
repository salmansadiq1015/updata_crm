'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, Clock3, LockKeyhole, Mail, MessageCircle,
  Pencil, RefreshCw, ShieldCheck, Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { usePermissions } from '@/shared/hooks/use-permissions';
import {
  messagingApi, type ConsentStatus, type LeadConsentChannel, type OutreachChannel,
} from '../services/messaging-api';
import {
  Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Textarea,
} from './lead-ui-kit';

const channelMeta = {
  email: { label: 'Email', icon: Mail, tone: 'text-blue-600 bg-blue-500/10' },
  sms: { label: 'SMS', icon: Smartphone, tone: 'text-violet-600 bg-violet-500/10' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, tone: 'text-emerald-600 bg-emerald-500/10' },
} satisfies Record<OutreachChannel, { label: string; icon: typeof Mail; tone: string }>;

const statusMeta = {
  granted: { label: 'Consent granted', detail: 'Evidence allows outreach while policy remains valid.', tone: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', icon: CheckCircle2 },
  denied: { label: 'Consent denied', detail: 'The recipient has not authorized this channel.', tone: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400', icon: LockKeyhole },
  revoked: { label: 'Consent revoked', detail: 'Consent was withdrawn and delivery is blocked.', tone: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400', icon: LockKeyhole },
  unknown: { label: 'Consent not recorded', detail: 'The contact is available, but no verified consent evidence is recorded.', tone: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400', icon: AlertTriangle },
  suppressed: { label: 'Suppressed', detail: 'A suppression overrides consent and blocks delivery.', tone: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400', icon: LockKeyhole },
  expired: { label: 'Consent expired', detail: 'Recorded consent has passed its expiry date.', tone: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400', icon: Clock3 },
};

function toLocalDateTime(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function readable(value?: string | null) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

type ConsentForm = {
  channel: OutreachChannel;
  status: ConsentStatus;
  evidence: string;
  source: string;
  capturedAt: string;
  expiresAt: string;
};

export function LeadConsentPanel({ leadId, canWrite }: { leadId: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canReinstate = hasPermission(PERMISSIONS.CRM_ADMIN);
  const queryKey = ['messaging', 'lead-consent', leadId];
  const consent = useQuery({ queryKey, queryFn: () => messagingApi.getLeadConsent(leadId), staleTime: 15_000 });
  const [editing, setEditing] = useState<LeadConsentChannel | null>(null);
  const [form, setForm] = useState<ConsentForm | null>(null);
  const [reinstatementConfirmed, setReinstatementConfirmed] = useState(false);

  const close = () => { setEditing(null); setForm(null); setReinstatementConfirmed(false); };
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey }); };
  const update = useMutation({
    mutationFn: (value: ConsentForm) => messagingApi.updateLeadConsent(leadId, {
      channel: value.channel, status: value.status, evidence: value.evidence.trim(), source: value.source,
      capturedAt: new Date(value.capturedAt).toISOString(),
      expiresAt: value.expiresAt ? new Date(value.expiresAt).toISOString() : null,
    }),
    onSuccess: async () => { await refresh(); close(); showSuccess('Consent evidence updated'); },
    onError: showError,
  });
  const reinstate = useMutation({
    mutationFn: (value: ConsentForm) => messagingApi.reinstateLeadConsent(leadId, {
      channel: value.channel, evidence: value.evidence.trim(), source: value.source,
      capturedAt: new Date(value.capturedAt).toISOString(),
      expiresAt: value.expiresAt ? new Date(value.expiresAt).toISOString() : null,
      confirmation: true,
    }),
    onSuccess: async () => { await refresh(); close(); showSuccess('Suppression released from verified renewed consent'); },
    onError: showError,
  });

  const openEditor = (item: LeadConsentChannel) => {
    setEditing(item);
    setReinstatementConfirmed(false);
    setForm({
      channel: item.channel, status: item.status, evidence: item.evidence || '', source: item.source || 'manual',
      capturedAt: item.capturedAt ? toLocalDateTime(new Date(item.capturedAt)) : toLocalDateTime(),
      expiresAt: item.expiresAt ? toLocalDateTime(new Date(item.expiresAt)) : '',
    });
  };
  const suppressedGrant = Boolean(editing?.suppression && form?.status === 'granted');
  const evidenceMinimum = suppressedGrant ? 10 : form?.status === 'granted' ? 5 : 0;
  const valid = Boolean(form && form.capturedAt && form.evidence.trim().length >= evidenceMinimum && (!suppressedGrant || (canReinstate && reinstatementConfirmed)));
  const pending = update.isPending || reinstate.isPending;

  if (consent.isLoading) return <div className="grid grid-cols-3 gap-2" aria-label="Loading consent status">{[0, 1, 2].map((key) => <div key={key} className="h-28 animate-pulse rounded-xl border border-border/60 bg-muted/30" />)}</div>;
  if (consent.isError) return <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3"><div className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />Consent status could not be loaded.</div><Button size="sm" variant="outline" onClick={() => void consent.refetch()}><RefreshCw className="h-3.5 w-3.5" />Retry</Button></div>;

  return <>
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-primary/[0.035] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3.5">
        <div><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Channel consent</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Effective eligibility is checked again immediately before every send.</p></div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><LockKeyhole className="h-3 w-3" />Evidence protected</span>
      </div>
      <div className="grid items-stretch gap-px bg-border/50 sm:grid-cols-3">
        {consent.data?.channels.map((item) => {
          const channel = channelMeta[item.channel];
          const effective = statusMeta[item.effectiveStatus];
          const ChannelIcon = channel.icon;
          const StatusIcon = effective.icon;
          const evidenceNote = item.suppression
            ? `${item.suppression.reason.replaceAll('_', ' ')} · ${readable(item.suppression.suppressedAt)}`
            : item.changedAt ? `Updated ${readable(item.changedAt)}` : 'Consent evidence not recorded';
          return <article key={item.channel} className="flex min-w-0 flex-col bg-background/95 p-4">
            <div className="flex items-center gap-2.5"><div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', channel.tone)}><ChannelIcon className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{channel.label}</p><p className="text-[10px] text-muted-foreground">Outreach channel</p></div></div>
            <div className="mt-3 flex min-h-[54px] flex-col items-start gap-1.5"><span className={cn('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold', item.hasDestination ? 'border-sky-500/20 bg-sky-500/[0.08] text-sky-700 dark:text-sky-400' : 'border-border bg-muted text-muted-foreground')}>{item.hasDestination ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}{item.hasDestination ? 'Contact available' : 'No contact'}</span><span className={cn('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold', effective.tone)}><StatusIcon className="h-3 w-3 shrink-0" />{effective.label}</span></div>
            <p className="mt-3 min-h-12 flex-1 text-[11px] leading-4 text-muted-foreground">{!item.hasDestination ? `No valid ${channel.label.toLowerCase()} destination.` : effective.detail}</p>
            <p className="mt-3 min-h-9 border-t border-border/50 pt-3 text-[10px] leading-4 text-muted-foreground" title={evidenceNote}>{evidenceNote}</p>
            {canWrite && <Button className="mt-3 w-full justify-center whitespace-nowrap" size="sm" variant={item.effectiveStatus === 'unknown' ? 'default' : 'outline'} aria-label={`${item.effectiveStatus === 'unknown' ? 'Record' : 'Manage'} ${channel.label} consent`} onClick={() => openEditor(item)}>{item.effectiveStatus === 'unknown' ? <ShieldCheck className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}{item.effectiveStatus === 'unknown' ? 'Record consent' : 'Manage consent'}</Button>}
          </article>;
        })}
      </div>
    </div>

    <Dialog open={Boolean(editing && form)} onOpenChange={(open) => { if (!open && !pending) close(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? `Manage ${channelMeta[editing.channel].label} consent` : 'Manage consent'}</DialogTitle><DialogDescription>Record only evidence you can verify. A public listing or available contact detail is not proof of promotional consent.</DialogDescription></DialogHeader>
        {form && editing && <DialogBody className="space-y-4">
          {editing.suppression && <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3"><p className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-400"><LockKeyhole className="h-4 w-4" />Active suppression: {editing.suppression.reason.replaceAll('_', ' ')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">A grant cannot override this protection. {canReinstate ? 'Selecting Granted requires explicit renewed opt-in evidence and releases only the current destination.' : 'An administrator must verify renewed opt-in before reinstatement.'}</p></div>}
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="consent-status">Consent status</Label><Select value={form.status} onValueChange={(status) => setForm({ ...form, status: status as ConsentStatus })}><SelectTrigger id="consent-status" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="granted">Granted</SelectItem><SelectItem value="denied">Denied</SelectItem><SelectItem value="revoked">Revoked</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select></div><div><Label htmlFor="consent-source">Evidence source</Label><Select value={form.source} onValueChange={(source) => setForm({ ...form, source })}><SelectTrigger id="consent-source" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual record</SelectItem><SelectItem value="signed_form">Signed form</SelectItem><SelectItem value="verbal_confirmation">Verbal confirmation</SelectItem><SelectItem value="imported_record">Imported evidence</SelectItem><SelectItem value="verified_reopt_in">Verified renewed opt-in</SelectItem></SelectContent></Select></div></div>
          <div><Label htmlFor="consent-evidence">Evidence {evidenceMinimum > 0 && '*'}</Label><Textarea id="consent-evidence" className="mt-1.5 min-h-24" maxLength={2000} value={form.evidence} onChange={(event) => setForm({ ...form, evidence: event.target.value })} placeholder="Describe when, where, and how the recipient authorized this channel…" /><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{evidenceMinimum ? `At least ${evidenceMinimum} characters required` : 'Optional internal evidence note'}</span><span>{form.evidence.length}/2000</span></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="consent-captured">Evidence captured</Label><Input id="consent-captured" className="mt-1.5" type="datetime-local" value={form.capturedAt} onChange={(event) => setForm({ ...form, capturedAt: event.target.value })} /></div><div><Label htmlFor="consent-expiry">Expires (optional)</Label><Input id="consent-expiry" className="mt-1.5" type="datetime-local" min={toLocalDateTime()} value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></div></div>
          {suppressedGrant && canReinstate && <label className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs leading-5"><input type="checkbox" className="mt-1" checked={reinstatementConfirmed} onChange={(event) => setReinstatementConfirmed(event.target.checked)} /><span>I confirm this evidence proves the current destination has newly opted in. Saving will remove its active suppression and is audit logged.</span></label>}
        </DialogBody>}
        <DialogFooter><Button variant="outline" onClick={close} disabled={pending}>Cancel</Button><Button disabled={!valid || pending} onClick={() => form && (suppressedGrant ? reinstate.mutate(form) : update.mutate(form))}>{pending ? 'Saving…' : suppressedGrant ? 'Verify and reinstate' : 'Save evidence'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
