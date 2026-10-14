'use client';

import { useId, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle, CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Eye, FileText, Mail, MessageCircle, MessageSquareText, Send, ShieldCheck,
  Sparkles, UserCheck, UserX, Users, X,
} from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import type { Lead } from '../types/lead-types';
import {
  messagingApi, type Campaign, type OutreachChannel, type OutreachPurpose,
} from '../services/messaging-api';
import {
  Alert, AlertDescription, Button, Dialog, DialogBody, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue, Textarea,
} from './lead-ui-kit';
import { buildWhatsAppComponents, whatsappTemplateSlots } from './whatsapp-template-mapping';

type Props = {
  open: boolean;
  leads: Lead[];
  defaultChannel?: OutreachChannel;
  filterSelection?: Record<string, unknown>;
  totalMatching?: number;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
};

const channelMeta = {
  email: { label: 'Email', icon: Mail, description: 'Rich, personalized messages', tone: 'from-sky-500/15 to-blue-500/5 text-sky-500' },
  sms: { label: 'SMS', icon: MessageSquareText, description: 'Fast, concise mobile outreach', tone: 'from-violet-500/15 to-fuchsia-500/5 text-violet-500' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, description: 'Approved Meta templates', tone: 'from-emerald-500/15 to-teal-500/5 text-emerald-500' },
} as const;

const variables = ['firstName', 'lastName', 'fullName', 'businessName', 'email', 'phone', 'city', 'country', 'category', 'rating', 'assignedUserName', 'companyName', 'senderName'];

function destination(lead: Lead, channel: OutreachChannel) {
  return channel === 'email' ? lead.email : lead.mobile || lead.phone;
}

function renderPreview(value: string, lead?: Lead) {
  if (!lead) return value;
  const name = lead.name || '';
  const parts = name.trim().split(/\s+/);
  const values: Record<string, string> = {
    firstName: parts[0] || '', lastName: parts.slice(1).join(' '), fullName: name,
    businessName: lead.type === 'business' ? name : '', email: lead.email || '',
    phone: lead.mobile || lead.phone || '', city: lead.address?.city || '', country: lead.address?.country || '',
    category: lead.sourceMetadata?.businessType || '', rating: lead.providerMeta?.rating?.toString() || '',
    assignedUserName: '', companyName: 'Updata', senderName: '',
  };
  return value.replace(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (_, key: string) => values[key] ?? `{{${key}}}`);
}

export function segmentInfo(text: string) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const length = [...text].length;
  const single = unicode ? 70 : 160;
  const multipart = unicode ? 67 : 153;
  return { length, segments: length <= single ? 1 : Math.ceil(length / multipart) };
}

export function recipientContactSummary(leads: Lead[], channel: OutreachChannel) {
  const contactable = leads.filter((lead) => Boolean(destination(lead, channel))).length;
  return { total: leads.length, contactable, missing: leads.length - contactable };
}

function ComposerSteps({ step }: { step: number }) {
  const steps = [
    { number: 1, label: 'Compose', detail: 'Message and template' },
    { number: 2, label: 'Recipients', detail: 'Audience and schedule' },
    { number: 3, label: 'Review', detail: 'Eligibility and launch' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2" aria-label={`Step ${step} of 3`}>
      {steps.map((item) => {
        const active = step === item.number;
        const complete = step > item.number;
        return (
          <div
            key={item.number}
            className={`relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${active ? 'border-primary/40 bg-primary/10' : complete ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border/70 bg-muted/20'}`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25' : complete ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>
              {complete ? <Check className="h-3.5 w-3.5" /> : item.number}
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-xs font-semibold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{item.label}</span>
              <span className="hidden truncate text-[10px] text-muted-foreground md:block">{item.detail}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MessagePreview({
  channel, subject, body, bodyHtml, representativeName, representative, templateName,
}: {
  channel: OutreachChannel;
  subject: string;
  body: string;
  bodyHtml: string;
  representativeName?: string;
  representative?: Lead;
  templateName?: string;
}) {
  const ChannelIcon = channelMeta[channel].icon;
  const previewBody = renderPreview(body, representative) || templateName || 'Your personalized message preview will appear here.';

  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm" aria-label="Live message preview">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${channelMeta[channel].tone}`}><ChannelIcon className="h-4 w-4" /></span>
          <div><p className="text-xs font-semibold">Live preview</p><p className="text-[10px] text-muted-foreground">{channelMeta[channel].label} · personalized</p></div>
        </div>
        <Eye className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="p-4">
        <div className={`mx-auto ${channel === 'email' ? 'max-w-full' : 'max-w-[310px]'} rounded-2xl border border-border/70 bg-background p-3.5 shadow-sm`}>
          <p className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Previewing for {representativeName || 'a representative lead'}</p>
          {channel === 'email' && <p className="mb-2 border-b border-border/60 pb-2 text-sm font-semibold">{renderPreview(subject, representative) || 'Email subject'}</p>}
          <div className="min-h-20 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{previewBody}</div>
        </div>
        {channel === 'email' && bodyHtml.trim() && <iframe title="HTML email preview" sandbox="" className="mt-3 h-44 w-full rounded-xl border border-border bg-white" srcDoc={renderPreview(bodyHtml, representative)} />}
      </div>
    </section>
  );
}

export function LeadOutreachComposer({
  open, leads, defaultChannel = 'email', filterSelection, totalMatching, onOpenChange, onComplete,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-hidden border-border/80 p-0 sm:max-w-5xl">
        {open && (
          <ComposerBody
            leads={leads}
            defaultChannel={defaultChannel}
            filterSelection={filterSelection}
            totalMatching={totalMatching}
            onClose={() => onOpenChange(false)}
            onComplete={onComplete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ComposerBody({
  leads, defaultChannel, filterSelection, totalMatching, onClose, onComplete,
}: Omit<Props, 'open' | 'onOpenChange'> & { defaultChannel: OutreachChannel; onClose: () => void }) {
  const formId = useId();
  const [step, setStep] = useState(1);
  const [channel, setChannel] = useState<OutreachChannel>(defaultChannel);
  const [purpose, setPurpose] = useState<OutreachPurpose>('promotional');
  const [campaignName, setCampaignName] = useState(`Lead outreach ${new Date().toLocaleDateString()}`);
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState<string>('custom');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => leads.map((lead) => lead.id));
  const [allFiltered, setAllFiltered] = useState(false);
  const [allowFallback, setAllowFallback] = useState(false);
  const [smsProvider, setSmsProvider] = useState<'auto' | 'textbee' | 'twilio'>('auto');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduleMin] = useState(() => new Date(Date.now() + 60_000).toISOString().slice(0, 16));
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [whatsappMappings, setWhatsappMappings] = useState<Record<string, string>>({});

  const templates = useQuery({
    queryKey: ['messaging', 'templates', channel],
    queryFn: () => messagingApi.listTemplates(channel),
    staleTime: 60_000,
  });
  const selectedTemplate = (templates.data ?? []).find((item) => item._id === templateId);
  const activeLeads = useMemo(() => leads.filter((lead) => selectedIds.includes(lead.id)), [leads, selectedIds]);
  const representative = activeLeads[previewIndex % Math.max(activeLeads.length, 1)];
  const contactSummary = useMemo(() => recipientContactSummary(activeLeads, channel), [activeLeads, channel]);
  const sms = segmentInfo(body);
  const whatsappSlots = useMemo(
    () => whatsappTemplateSlots(selectedTemplate?.whatsapp?.providerDefinition),
    [selectedTemplate?.whatsapp?.providerDefinition],
  );
  const whatsappComponents = useMemo(
    () => buildWhatsAppComponents(whatsappSlots, whatsappMappings),
    [whatsappMappings, whatsappSlots],
  );

  const changeChannel = (nextChannel: OutreachChannel) => {
    setChannel(nextChannel);
    setTemplateId('custom');
    setSubject('');
    setBody('');
    setBodyHtml('');
    setWhatsappMappings({});
    setCampaign(null);
    setStep(1);
  };

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const template = (templates.data ?? []).find((item) => item._id === id);
    if (!template) return;
    setPurpose(template.purpose);
    setSubject(template.subject || '');
    setBody(template.bodyText || '');
    setBodyHtml(template.bodyHtml || '');
    setWhatsappMappings({});
  };

  const createDraft = useMutation({
    mutationFn: () => messagingApi.createCampaign({
      name: campaignName.trim(), description: description.trim(), channel, purpose,
      templateId: templateId === 'custom' ? null : templateId,
      content: {
        subject: channel === 'email' ? subject : '', bodyText: body,
        bodyHtml: channel === 'email' ? (bodyHtml.trim() || body.replace(/\n/g, '<br>')) : '',
        whatsappTemplateName: selectedTemplate?.whatsapp?.metaName || null,
        whatsappLanguage: selectedTemplate?.whatsapp?.language || null,
        whatsappComponents: whatsappSlots.length ? whatsappComponents : (selectedTemplate?.whatsapp?.components || []),
        whatsappTwilioContentSid: selectedTemplate?.whatsapp?.twilioContentSid || null,
      },
      selection: allFiltered && filterSelection
        ? { mode: 'filters', filters: filterSelection }
        : { mode: 'explicit', leadIds: selectedIds },
      routing: { smsProvider, allowFallback },
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }),
    onSuccess: (value) => { setCampaign(value); setStep(3); },
    onError: showError,
  });

  const start = useMutation({
    mutationFn: () => messagingApi.startCampaign(campaign!._id, scheduledAt ? new Date(scheduledAt).toISOString() : null),
    onSuccess: (value) => {
      setCampaign(value);
      showSuccess(scheduledAt ? 'Campaign scheduled' : 'Campaign queued for delivery');
      onComplete?.();
    },
    onError: showError,
  });

  const reviewRecipients = useQuery({
    queryKey: ['messaging', 'draft-recipients', campaign?._id, reviewPage],
    queryFn: () => messagingApi.listRecipients(campaign!._id, { page: reviewPage, limit: 25 }),
    enabled: Boolean(campaign?._id && campaign.status === 'draft'),
  });
  const removeDraftRecipient = useMutation({
    mutationFn: (recipientId: string) => messagingApi.removeDraftRecipient(campaign!._id, recipientId),
    onSuccess: (value) => {
      setCampaign(value);
      void reviewRecipients.refetch();
      showSuccess('Recipient removed from this draft');
    },
    onError: showError,
  });

  const whatsappMappingReady = whatsappSlots.every((slot) => {
    const value = whatsappMappings[slot.key]?.trim();
    return Boolean(value) && (slot.parameterType === 'text' || /^https:\/\//i.test(value));
  });
  const whatsappReady = channel !== 'whatsapp' || (
    selectedTemplate?.whatsapp?.approvalStatus === 'approved'
    && selectedTemplate.whatsapp.metaName
    && selectedTemplate.whatsapp.language
    && Array.isArray(selectedTemplate.whatsapp.providerDefinition)
    && selectedTemplate.whatsapp.providerDefinition.length > 0
    && whatsappMappingReady
  );
  const contentReady = channel === 'whatsapp' ? whatsappReady : body.trim().length > 0 && (channel !== 'email' || subject.trim().length > 0);
  const selectionCount = allFiltered && totalMatching != null ? totalMatching : selectedIds.length;
  const canContinue = campaignName.trim().length > 0 && contentReady && selectionCount > 0;

  if (campaign && step === 3) {
    const done = ['queued', 'scheduled', 'running', 'completed'].includes(campaign.status);
    return (
      <>
        <DialogHeader className="border-b border-border/70 bg-gradient-to-br from-primary/[0.08] via-background to-background px-5 pb-5 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'}`}>{done ? <CheckCircle2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</span>
            <div><DialogTitle className="text-xl">{done ? 'Campaign is in progress' : 'Review and confirm'}</DialogTitle><DialogDescription className="mt-1">{done ? 'Delivery is now handled by the background messaging pipeline.' : 'Recipient eligibility was calculated server-side from the saved selection.'}</DialogDescription></div>
          </div>
          <div className="mt-5"><ComposerSteps step={3} /></div>
        </DialogHeader>
        <DialogBody className="max-h-[67vh] space-y-5 overflow-y-auto bg-muted/[0.06] px-5 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Selected', campaign.summary.total, 'text-foreground'],
              ['Eligible', campaign.summary.eligible, 'text-emerald-500'],
              ['Ineligible', campaign.summary.ineligible, 'text-amber-500'],
              ['Missing contact', campaign.summary.missingContact || 0, 'text-amber-500'],
              ['Invalid contact', campaign.summary.invalidContact || 0, 'text-amber-500'],
              ['Duplicates', campaign.summary.duplicate || 0, 'text-amber-500'],
              ['Opted out', campaign.summary.optedOut || 0, 'text-rose-500'],
              ['Suppressed', campaign.summary.suppressed, 'text-rose-500'],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
                <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
                <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          {campaign.summary.eligible === 0 && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>No recipients are currently eligible. Record channel consent and valid contact details before sending.</AlertDescription></Alert>
          )}
          {!done && (
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border/70 bg-muted/10 px-4 py-3.5">
                <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-4 w-4" /></span><div><p className="text-sm font-semibold">Snapshotted recipients</p><p className="text-xs text-muted-foreground">Inspect and remove recipients before the campaign enters the queue.</p></div></div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{reviewRecipients.data?.pagination.total ?? campaign.summary.total} total</span>
              </div>
              <div className="max-h-52 divide-y divide-border overflow-y-auto">
                {(reviewRecipients.data?.data ?? []).map((recipient) => {
                  const lead = typeof recipient.leadId === 'object' ? recipient.leadId : null;
                  return (
                    <div key={recipient._id} className="group flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/20">
                      <div className="flex min-w-0 items-center gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${recipient.destination ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{recipient.destination ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{lead?.name || 'Lead'}</p><p className="truncate text-xs text-muted-foreground">{recipient.destination || recipient.eligibility?.reasons.join(', ') || recipient.status}</p></div></div>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${lead?.name || 'recipient'} from draft`} disabled={removeDraftRecipient.isPending} onClick={() => removeDraftRecipient.mutate(recipient._id)}><X className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
                {!reviewRecipients.isLoading && !reviewRecipients.data?.data.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No recipients remain in this draft.</p>}
              </div>
              {(reviewRecipients.data?.pagination.pages ?? 0) > 1 && <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2"><Button type="button" size="sm" variant="ghost" disabled={reviewPage <= 1} onClick={() => setReviewPage((page) => Math.max(1, page - 1))}>Previous</Button><span className="text-xs text-muted-foreground">Page {reviewPage} of {reviewRecipients.data?.pagination.pages}</span><Button type="button" size="sm" variant="ghost" disabled={reviewPage >= (reviewRecipients.data?.pagination.pages ?? 1)} onClick={() => setReviewPage((page) => page + 1)}>Next</Button></div>}
            </div>
          )}
          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${channelMeta[channel].tone}`}>{(() => { const ChannelIcon = channelMeta[channel].icon; return <ChannelIcon className="h-4 w-4" />; })()}</span><div><p className="text-sm font-semibold">{campaign.name}</p><p className="text-xs text-muted-foreground">{channelMeta[channel].label} · {purpose}</p></div></div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{campaign.status}</span>
            </div>
            <div className="mt-4"><MessagePreview channel={channel} subject={subject} body={body} bodyHtml={bodyHtml} representative={representative} representativeName={representative?.name} templateName={selectedTemplate?.name} /></div>
          </div>
          <p className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />Consent and suppression are checked again immediately before each provider submission. Accepted does not mean delivered.</p>
        </DialogBody>
        <DialogFooter className="border-t border-border/70 bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
          {!done && <Button variant="outline" onClick={() => { setCampaign(null); setStep(2); }}><ChevronLeft className="h-4 w-4" /> Back</Button>}
          <Button variant={done ? 'default' : 'outline'} onClick={onClose}>{done ? 'Close' : 'Save draft'}</Button>
          {!done && <Button disabled={campaign.summary.eligible === 0 || start.isPending} onClick={() => start.mutate()}><Send className="h-4 w-4" />{scheduledAt ? 'Schedule campaign' : 'Confirm and send'}</Button>}
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="border-b border-border/70 bg-gradient-to-br from-primary/[0.08] via-background to-background px-5 pb-5 pt-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><Sparkles className="h-5 w-5" /></span>
          <div><DialogTitle className="text-xl">New outreach campaign</DialogTitle><DialogDescription className="mt-1">Build a personalized message, verify every recipient, then launch with confidence.</DialogDescription></div>
        </div>
        <div className="mt-5"><ComposerSteps step={step} /></div>
      </DialogHeader>
      <DialogBody className="max-h-[67vh] overflow-y-auto bg-muted/[0.06] px-5 py-5 sm:px-6">
        {step === 1 ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Send className="h-3.5 w-3.5" /></span><div><p className="text-sm font-semibold">Choose a channel</p><p className="text-xs text-muted-foreground">Select how this audience should receive your message.</p></div></div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(channelMeta) as OutreachChannel[]).map((item) => {
                    const meta = channelMeta[item];
                    const Icon = meta.icon;
                    return <button key={item} type="button" aria-label={meta.label} aria-pressed={channel === item} onClick={() => changeChannel(item)} className={`group rounded-xl border p-3 text-left transition-all ${channel === item ? 'border-primary/50 bg-primary/[0.08] text-primary ring-1 ring-primary/15' : 'border-border/80 hover:border-primary/25 hover:bg-muted/30'}`}><span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${meta.tone}`}><Icon className="h-4 w-4" /></span><span className="block text-sm font-semibold">{meta.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{meta.description}</span></button>;
                  })}
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Campaign details</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label htmlFor={`${formId}-name`}>Campaign name</Label><Input id={`${formId}-name`} className="mt-1.5" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} maxLength={160} /></div>
                  <div><Label>Purpose</Label><Select value={purpose} onValueChange={(value) => setPurpose(value as OutreachPurpose)}><SelectTrigger aria-label="Purpose" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="promotional">Promotional outreach</SelectItem><SelectItem value="transactional">Transactional</SelectItem><SelectItem value="support">Customer support</SelectItem></SelectContent></Select></div>
                </div>
                <div><Label htmlFor={`${formId}-description`}>Internal description <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-description`} className="mt-1.5" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context for your team" /></div>
              </section>

              <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Message content</p></div>
                <div><Label>Template</Label><Select value={templateId} onValueChange={chooseTemplate}><SelectTrigger aria-label="Template" className="mt-1.5"><SelectValue placeholder="Choose a template" /></SelectTrigger><SelectContent><SelectItem value="custom">Custom message</SelectItem>{(templates.data ?? []).map((template) => <SelectItem key={template._id} value={template._id}>{template.name}{template.channel === 'whatsapp' ? ` · ${template.whatsapp?.approvalStatus || 'draft'}` : ''}</SelectItem>)}</SelectContent></Select></div>
                {channel === 'email' && <div><Label htmlFor={`${formId}-subject`}>Subject</Label><Input id={`${formId}-subject`} className="mt-1.5" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={500} placeholder="A concise, relevant subject" /></div>}
                {channel === 'whatsapp' ? (
                  <>
                    <Alert variant={selectedTemplate?.whatsapp?.approvalStatus === 'approved' ? 'default' : 'destructive'}><ShieldCheck className="h-4 w-4" /><AlertDescription>{selectedTemplate?.whatsapp?.approvalStatus === 'approved' ? `Approved Meta template: ${selectedTemplate?.whatsapp?.metaName} (${selectedTemplate?.whatsapp?.language})` : 'Select a Meta-approved WhatsApp template. Ordinary editable drafts cannot be sent as business-initiated messages.'}</AlertDescription></Alert>
                    {whatsappSlots.length > 0 && <div className="grid gap-3 rounded-xl border border-border bg-muted/10 p-4 sm:grid-cols-2"><div className="sm:col-span-2"><p className="text-sm font-semibold">Required template parameters</p><p className="text-xs text-muted-foreground">Map every approved placeholder in Meta&apos;s fixed parameter order.</p></div>{whatsappSlots.map((slot) => <div key={slot.key}><Label>{slot.label}</Label>{slot.parameterType === 'text' ? <Select value={(whatsappMappings[slot.key] || '').replace(/^\{\{|\}\}$/g, '')} onValueChange={(value) => setWhatsappMappings((current) => ({ ...current, [slot.key]: `{{${value}}}` }))}><SelectTrigger aria-label={slot.label} className="mt-1.5"><SelectValue placeholder="Choose personalization" /></SelectTrigger><SelectContent>{variables.map((variable) => <SelectItem key={variable} value={variable}>{`{{${variable}}}`}</SelectItem>)}</SelectContent></Select> : <Input aria-label={slot.label} className="mt-1.5" placeholder="https://..." value={whatsappMappings[slot.key] || ''} onChange={(event) => setWhatsappMappings((current) => ({ ...current, [slot.key]: event.target.value }))} />}</div>)}</div>}
                  </>
                ) : (
                  <div className="space-y-4">
                    <div><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={`${formId}-message`}>{channel === 'email' ? 'Plain-text fallback' : 'Message'}</Label>{channel === 'sms' && <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">{sms.length} characters · ~{sms.segments} segment{sms.segments === 1 ? '' : 's'}</span>}</div><Textarea aria-label="Message" id={`${formId}-message`} className="mt-1.5 min-h-36 resize-y leading-6" value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} placeholder="Write a clear, personal message…" /></div>
                    {channel === 'email' && <div><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={`${formId}-html`}>HTML content (optional)</Label><span className="text-[10px] text-muted-foreground">Personalization is escaped server-side</span></div><Textarea id={`${formId}-html`} className="mt-1.5 min-h-40 font-mono text-xs" value={bodyHtml} onChange={(event) => setBodyHtml(event.target.value)} maxLength={200000} placeholder={'<p>Hello {{firstName}},</p>\n<p>...</p>'} /></div>}
                  </div>
                )}
                {channel !== 'whatsapp' && <div><p className="mb-2 text-xs font-medium text-muted-foreground">Insert personalization</p><div className="flex flex-wrap gap-1.5">{variables.map((variable) => <button key={variable} type="button" onClick={() => setBody((value) => `${value}{{${variable}}}`)} className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary">{`{{${variable}}}`}</button>)}</div></div>}
              </section>
            </div>
            <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
              <MessagePreview channel={channel} subject={subject} body={body} bodyHtml={bodyHtml} representative={representative} representativeName={representative?.name} templateName={selectedTemplate?.name} />
              <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm"><p className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-500" />Safety before speed</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Consent, suppression, destination validity, and provider eligibility are checked again before delivery.</p></div>
            </aside>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b border-border/70 p-4 sm:p-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-4 w-4" /></span><div><p className="text-sm font-semibold">Recipient selection</p><p className="text-xs text-muted-foreground">The server snapshots exactly what you confirm.</p></div></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{selectionCount} selected</span></div>
                {filterSelection && totalMatching != null && <div className="border-b border-border/70 p-4 sm:p-5"><label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${allFiltered ? 'border-primary/40 bg-primary/[0.06]' : 'border-border hover:bg-muted/20'}`}><input type="checkbox" className="mt-1 accent-primary" checked={allFiltered} onChange={(event) => setAllFiltered(event.target.checked)} /><span><span className="block text-sm font-medium">All {totalMatching} results matching current filters</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Uses only the active filters and never expands beyond them.</span></span></label></div>}
                {!allFiltered && <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">{activeLeads.map((lead) => { const target = destination(lead, channel); return <div key={lead.id} className="group flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/25 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${target ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{target ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{lead.name}</p><p className={`truncate text-xs ${target ? 'text-muted-foreground' : 'text-amber-500'}`}>{target || `No valid ${channel === 'email' ? 'email address' : 'phone number'}`}</p></div></div><button type="button" aria-label={`Remove ${lead.name}`} onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== lead.id))} className="rounded-lg p-2 text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"><X className="h-4 w-4" /></button></div>; })}{activeLeads.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">No recipients remain in this selection.</p>}</div>}
              </section>
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />Contact details alone are not proof of consent. Promotional outreach and business-initiated WhatsApp require recorded opt-in.</div>
            </div>
            <aside className="space-y-4">
              <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Delivery controls</p></div>
                <div><Label htmlFor={`${formId}-schedule`}>Schedule <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-schedule`} type="datetime-local" className="mt-1.5" min={scheduleMin} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></div>
                {channel === 'sms' && <div><Label>SMS provider</Label><Select value={smsProvider} onValueChange={(value) => setSmsProvider(value as typeof smsProvider)}><SelectTrigger aria-label="SMS provider" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">TextBee primary</SelectItem><SelectItem value="textbee">TextBee only</SelectItem><SelectItem value="twilio">Twilio direct</SelectItem></SelectContent></Select></div>}
                {channel === 'sms' && smsProvider === 'auto' && <label className={`flex items-start gap-3 rounded-xl border p-3 transition ${allowFallback ? 'border-primary/30 bg-primary/5' : 'border-border'}`}><input type="checkbox" className="mt-1 accent-primary" checked={allowFallback} onChange={(event) => setAllowFallback(event.target.checked)} /><span><span className="block text-xs font-semibold">Allow policy-controlled Twilio fallback</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">Only proven non-acceptance is eligible. Ambiguous TextBee outcomes never fall back.</span></span></label>}
              </section>
              <div className="grid grid-cols-3 gap-2">
                {[['Selected', selectionCount, Users, 'text-primary'], ['Contact ready', allFiltered ? '—' : contactSummary.contactable, UserCheck, 'text-emerald-500'], ['Missing', allFiltered ? '—' : contactSummary.missing, UserX, 'text-amber-500']].map(([label, value, Icon, color]) => { const MetricIcon = Icon as typeof Users; return <div key={String(label)} className="rounded-xl border border-border/80 bg-card p-3 text-center shadow-sm"><MetricIcon className={`mx-auto h-4 w-4 ${color}`} /><p className="mt-2 text-lg font-semibold tabular-nums">{value as string | number}</p><p className="text-[10px] text-muted-foreground">{label as string}</p></div>; })}
              </div>
              <div className="relative"><MessagePreview channel={channel} subject={subject} body={body} bodyHtml={bodyHtml} representative={representative} representativeName={representative?.name || 'filtered recipient'} templateName={selectedTemplate?.name} />{activeLeads.length > 1 && <div className="absolute right-12 top-2.5 flex gap-0.5"><Button type="button" aria-label="Previous preview recipient" size="icon-sm" variant="ghost" onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button type="button" aria-label="Next preview recipient" size="icon-sm" variant="ghost" onClick={() => setPreviewIndex((index) => index + 1)}><ChevronRight className="h-4 w-4" /></Button></div>}</div>
            </aside>
          </div>
        )}
      </DialogBody>
      <DialogFooter className="border-t border-border/70 bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
        <div className="mr-auto hidden text-xs text-muted-foreground sm:block">{!canContinue ? 'Complete the required fields to continue.' : step === 1 ? 'Message ready for recipient review.' : 'Selection ready for server verification.'}</div>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {step === 2 && <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4" /> Back</Button>}
        {step === 1 ? <Button disabled={!canContinue} onClick={() => setStep(2)}>Recipients <ChevronRight className="h-4 w-4" /></Button> : <Button disabled={!canContinue || createDraft.isPending} onClick={() => createDraft.mutate()}><CheckCircle2 className="h-4 w-4" /> Preview eligibility</Button>}
      </DialogFooter>
    </>
  );
}
