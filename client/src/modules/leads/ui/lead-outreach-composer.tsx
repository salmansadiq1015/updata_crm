'use client';

import { useId, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle, BookOpen, CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Code2, Eye, FileText, LayoutTemplate, Mail, MessageCircle, MessageSquareText, RefreshCw,
  Send, ShieldCheck, SlidersHorizontal, Sparkles, UserCheck, UserX, Users, X,
} from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth-store';
import { COMPANY_NAME } from '@/shared/constants/application';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { usePermissions } from '@/shared/hooks/use-permissions';
import type { Lead } from '../types/lead-types';
import {
  messagingApi, type Campaign, type MessageTemplate, type OutreachChannel, type OutreachPurpose,
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

const variableLabels: Record<string, string> = {
  firstName: 'First name', lastName: 'Last name', fullName: 'Full name',
  businessName: 'Business name', email: 'Email address', phone: 'Phone number',
  city: 'City', country: 'Country', category: 'Business category', rating: 'Rating',
  assignedUserName: 'Assigned user', companyName: 'Your company name', senderName: 'Sender name',
};

const campaignVariables = new Set(['companyName', 'senderName']);

const templateCategoryLabels: Record<string, string> = {
  'business-introduction': 'Introduction',
  'sales-outreach': 'Sales',
  'lead-follow-up': 'Follow-up',
  'meeting-request': 'Meeting',
  'quote-follow-up': 'Quote',
  'customer-support': 'Support',
  'thank-you': 'Thank you',
  're-engagement': 'Re-engagement',
  'service-promotion': 'Services',
  'appointment-reminder': 'Reminder',
  custom: 'Custom',
};

function toLocalDateTime(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function destination(lead: Lead, channel: OutreachChannel) {
  return channel === 'email' ? lead.email : lead.mobile || lead.phone;
}

function leadPreviewVariables(lead?: Lead) {
  if (!lead) return {} as Record<string, string>;
  const name = lead.name || '';
  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] || '', lastName: parts.slice(1).join(' '), fullName: name,
    businessName: lead.type === 'business' ? name : '', email: lead.email || '',
    phone: lead.mobile || lead.phone || '', city: lead.address?.city || '', country: lead.address?.country || '',
    category: lead.sourceMetadata?.businessType || '', rating: lead.providerMeta?.rating?.toString() || '',
    assignedUserName: '',
  };
}

function extractTemplateVariables(...values: string[]) {
  const found = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g)) found.add(match[1]);
  }
  return variables.filter((variable) => found.has(variable));
}

function renderPreview(value: string, lead?: Lead, fallbackValues: Record<string, string> = {}) {
  const leadValues = leadPreviewVariables(lead);
  return value.replace(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (_, key: string) => (
    leadValues[key] || fallbackValues[key] || `{{${key}}}`
  ));
}

export function segmentInfo(text: string) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const length = [...text].length;
  const single = unicode ? 70 : 160;
  const multipart = unicode ? 67 : 153;
  return { length, segments: length <= single ? 1 : Math.ceil(length / multipart) };
}

const eligibilityReasonLabels: Record<string, string> = {
  consent_required: 'Verified channel consent is required',
  consent_expired: 'Recorded consent has expired',
  opted_out: 'Recipient has opted out',
  suppressed: 'Destination is suppressed',
  missing_email: 'Email address is missing',
  invalid_email: 'Email address is invalid',
  missing_phone: 'Phone number is missing',
  invalid_phone: 'Phone number is invalid',
  approved_template_required: 'An approved WhatsApp template is required',
  template_not_approved: 'WhatsApp template is not approved by Meta',
};

export function eligibilityReasonLabel(reason: string, channel: OutreachChannel) {
  if (reason.startsWith('missing_variables:')) {
    return `Required personalization is missing: ${reason.slice('missing_variables:'.length)}`;
  }
  if (reason.startsWith('unresolved_variables:')) {
    return `Personalization could not be resolved: ${reason.slice('unresolved_variables:'.length)}`;
  }
  if (reason === 'consent_required') {
    return `Verified ${channelMeta[channel].label} consent is required`;
  }
  return eligibilityReasonLabels[reason] || reason.replaceAll('_', ' ');
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
  channel, subject, body, bodyHtml, fallbackValues, representativeName, representative, templateName,
}: {
  channel: OutreachChannel;
  subject: string;
  body: string;
  bodyHtml: string;
  fallbackValues: Record<string, string>;
  representativeName?: string;
  representative?: Lead;
  templateName?: string;
}) {
  const ChannelIcon = channelMeta[channel].icon;
  const previewBody = renderPreview(body, representative, fallbackValues) || templateName || 'Your personalized message preview will appear here.';

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
          {channel === 'email' && <p className="mb-2 border-b border-border/60 pb-2 text-sm font-semibold">{renderPreview(subject, representative, fallbackValues) || 'Email subject'}</p>}
          <div className="min-h-20 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{previewBody}</div>
        </div>
        {channel === 'email' && bodyHtml.trim() && <iframe title="HTML email preview" sandbox="" className="mt-3 h-44 w-full rounded-xl border border-border bg-white" srcDoc={renderPreview(bodyHtml, representative, fallbackValues)} />}
      </div>
    </section>
  );
}

function EmailTemplateLibrary({
  templates, selectedId, isLoading, isError, onSelect, onRetry,
}: {
  templates: MessageTemplate[];
  selectedId: string;
  isLoading: boolean;
  isError: boolean;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-muted/[0.08]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><BookOpen className="h-4 w-4" /></span>
          <div className="min-w-0"><p className="text-xs font-semibold">Email template library</p><p className="truncate text-[10px] text-muted-foreground">Start with a polished, editable message</p></div>
        </div>
        {!isLoading && !isError && <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] font-semibold tabular-nums text-muted-foreground">{templates.length} ready</span>}
      </div>

      {isLoading ? (
        <div className="grid gap-2 p-3 sm:grid-cols-2" aria-label="Loading email templates">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-[92px] animate-pulse rounded-xl border border-border/60 bg-muted/40" />)}
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 p-4">
          <div><p className="text-xs font-semibold text-destructive">Template library could not be loaded</p><p className="mt-1 text-[10px] text-muted-foreground">You can retry without losing this campaign.</p></div>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />Retry</Button>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-label="Start with a custom email"
              aria-pressed={selectedId === 'custom'}
              onClick={() => onSelect('custom')}
              className={`group flex min-h-[92px] items-start gap-3 rounded-xl border p-3 text-left transition-all ${selectedId === 'custom' ? 'border-primary/50 bg-primary/[0.08] ring-1 ring-primary/15' : 'border-border/70 bg-background hover:border-primary/30 hover:bg-primary/[0.03]'}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selectedId === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}`}><FileText className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-xs font-semibold">Custom message</span>{selectedId === 'custom' && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">Write an email from a clean canvas.</span></span>
            </button>
            {templates.map((template) => {
              const selected = selectedId === template._id;
              const category = templateCategoryLabels[template.category || 'custom'] || template.category || 'Template';
              return (
                <button
                  key={template._id}
                  type="button"
                  aria-label={`Use ${template.name} template`}
                  aria-pressed={selected}
                  onClick={() => onSelect(template._id)}
                  className={`group flex min-h-[92px] items-start gap-3 rounded-xl border p-3 text-left transition-all ${selected ? 'border-primary/50 bg-primary/[0.08] ring-1 ring-primary/15' : 'border-border/70 bg-background hover:-translate-y-px hover:border-primary/30 hover:shadow-sm'}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25' : 'bg-gradient-to-br from-sky-500/15 to-violet-500/10 text-primary'}`}><LayoutTemplate className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="truncate text-xs font-semibold">{template.name}</span>{selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}</span>
                    <span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-muted-foreground">{template.description || 'Reusable email template'}</span>
                    <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">{category}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {templates.length === 0 && <div className="mt-2 rounded-xl border border-dashed border-border p-4 text-center"><p className="text-xs font-semibold">No saved email templates yet</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Custom email remains available. An administrator can run the outreach template seed to add the starter library.</p></div>}
        </div>
      )}
    </div>
  );
}

function PersonalizationFields({
  formId, values, usedVariables, requiredVariables, representative, onChange,
}: {
  formId: string;
  values: Record<string, string>;
  usedVariables: string[];
  requiredVariables: string[];
  representative?: Lead;
  onChange: (name: string, value: string) => void;
}) {
  const leadValues = leadPreviewVariables(representative);
  const recipientVariables = usedVariables.filter((variable) => !campaignVariables.has(variable));

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.025]">
      <div className="flex items-start gap-3 border-b border-primary/10 px-4 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><SlidersHorizontal className="h-4 w-4" /></span>
        <div><p className="text-xs font-semibold">Personalization details</p><p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">Fill campaign details once. Recipient information is taken separately from each lead.</p></div>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {['companyName', 'senderName'].map((variable) => (
            <div key={variable}>
              <div className="flex items-center justify-between gap-2"><Label htmlFor={`${formId}-${variable}`}>{variableLabels[variable]}</Label><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">Campaign</span></div>
              <Input
                id={`${formId}-${variable}`}
                aria-label={variableLabels[variable]}
                className="mt-1.5 bg-background"
                value={values[variable] || ''}
                maxLength={500}
                placeholder={variable === 'companyName' ? 'Your business or brand' : 'Name shown in the signature'}
                onChange={(event) => onChange(variable, event.target.value)}
              />
            </div>
          ))}
        </div>

        {recipientVariables.length > 0 && (
          <div className="border-t border-primary/10 pt-4">
            <div className="mb-3"><p className="text-xs font-semibold">Missing lead-data fallbacks</p><p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">Used only when that field is empty on an individual lead. Existing lead values always remain personalized.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {recipientVariables.map((variable) => {
                const automaticValue = leadValues[variable];
                const required = requiredVariables.includes(variable);
                return (
                  <div key={variable}>
                    <div className="flex items-center justify-between gap-2"><Label htmlFor={`${formId}-fallback-${variable}`}>{variableLabels[variable] || variable} fallback</Label>{required && <span className="text-[9px] font-semibold text-amber-500">Required</span>}</div>
                    <Input
                      id={`${formId}-fallback-${variable}`}
                      aria-label={`${variableLabels[variable] || variable} fallback`}
                      className="mt-1.5 bg-background"
                      value={values[variable] || ''}
                      maxLength={500}
                      placeholder={automaticValue ? `Lead value: ${automaticValue}` : 'Enter a safe fallback'}
                      onChange={(event) => onChange(variable, event.target.value)}
                    />
                    <p className="mt-1 truncate text-[9px] text-muted-foreground">{automaticValue ? `Preview lead provides: ${automaticValue}` : 'Preview lead has no value for this field'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
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
  const { hasPermission } = usePermissions();
  const currentUser = useAuthStore((state: { user?: { firstName?: string; lastName?: string } | null }) => state.user);
  const canVerifyConsent = hasPermission(PERMISSIONS.CRM_ADMIN);
  const defaultSenderName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || 'Updata team';
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
  const [fallbackValues, setFallbackValues] = useState<Record<string, string>>(() => ({
    companyName: COMPANY_NAME,
    senderName: defaultSenderName,
  }));
  const [showHtmlEditor, setShowHtmlEditor] = useState(false);
  const [htmlEditorMode, setHtmlEditorMode] = useState<'rendered' | 'template'>('rendered');
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
  const [selectedConsentRecipientIds, setSelectedConsentRecipientIds] = useState<string[]>([]);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [consentEvidence, setConsentEvidence] = useState('');
  const [consentSource, setConsentSource] = useState('manual_admin_verification');
  const [consentCapturedAt, setConsentCapturedAt] = useState(() => toLocalDateTime());
  const [consentExpiresAt, setConsentExpiresAt] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const templates = useQuery({
    queryKey: ['messaging', 'templates', channel],
    queryFn: () => messagingApi.listTemplates(channel),
    staleTime: 60_000,
    refetchOnMount: 'always',
  });
  const selectedTemplate = (templates.data ?? []).find((item) => item._id === templateId);
  const activeLeads = useMemo(() => leads.filter((lead) => selectedIds.includes(lead.id)), [leads, selectedIds]);
  const representative = activeLeads[previewIndex % Math.max(activeLeads.length, 1)];
  const personalizationVariables = useMemo(
    () => extractTemplateVariables(subject, body, bodyHtml),
    [body, bodyHtml, subject],
  );
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
    setFallbackValues((current) => ({
      companyName: current.companyName || COMPANY_NAME,
      senderName: current.senderName || defaultSenderName,
    }));
    setShowHtmlEditor(false);
    setHtmlEditorMode('rendered');
    setWhatsappMappings({});
    setCampaign(null);
    setStep(1);
  };

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    if (id === 'custom') {
      setPurpose('promotional');
      setSubject('');
      setBody('');
      setBodyHtml('');
      setFallbackValues((current) => ({
        companyName: current.companyName || COMPANY_NAME,
        senderName: current.senderName || defaultSenderName,
      }));
      setShowHtmlEditor(false);
      setHtmlEditorMode('rendered');
      setWhatsappMappings({});
      return;
    }
    const template = (templates.data ?? []).find((item) => item._id === id);
    if (!template) return;
    setPurpose(template.purpose);
    setSubject(template.subject || '');
    setBody(template.bodyText || '');
    setBodyHtml(template.bodyHtml || '');
    // Keep what the user typed; an untouched default is replaced by the template's own value.
    const edited = (value: string | undefined, untouched: string) => (value && value !== untouched ? value : '');
    setFallbackValues((current) => ({
      ...(template.fallbackValues || {}),
      companyName: edited(current.companyName, COMPANY_NAME) || template.fallbackValues?.companyName || COMPANY_NAME,
      senderName: edited(current.senderName, defaultSenderName) || template.fallbackValues?.senderName || defaultSenderName,
    }));
    setShowHtmlEditor(false);
    setHtmlEditorMode('rendered');
    setWhatsappMappings({});
  };

  const createDraft = useMutation({
    mutationFn: () => messagingApi.createCampaign({
      name: campaignName.trim(), description: description.trim(), channel, purpose,
      templateId: templateId === 'custom' ? null : templateId,
      content: {
        subject: channel === 'email' ? subject : '', bodyText: body,
        bodyHtml: channel === 'email' ? (bodyHtml.trim() || body.replace(/\n/g, '<br>')) : '',
        fallbackValues: Object.fromEntries(Object.entries(fallbackValues)
          .map(([key, value]) => [key, value.trim()])
          .filter(([, value]) => value)),
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
  const verifyConsent = useMutation({
    mutationFn: () => messagingApi.verifyCampaignConsent(campaign!._id, {
      recipientIds: selectedConsentRecipientIds,
      evidence: consentEvidence.trim(), source: consentSource,
      capturedAt: new Date(consentCapturedAt).toISOString(),
      expiresAt: consentExpiresAt ? new Date(consentExpiresAt).toISOString() : null,
      confirmation: true,
    }),
    onSuccess: async (value) => {
      setCampaign(value.campaign);
      setSelectedConsentRecipientIds([]);
      setConsentDialogOpen(false);
      setConsentEvidence('');
      setConsentConfirmed(false);
      await reviewRecipients.refetch();
      showSuccess(`${value.verified} recipient consent ${value.verified === 1 ? 'record' : 'records'} verified`);
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
  const reviewReasonCodes = [...new Set(
    (reviewRecipients.data?.data ?? []).flatMap((recipient) => recipient.eligibility?.reasons ?? []),
  )];
  const consentBlocksReview = reviewReasonCodes.includes('consent_required');
  const consentBlockedRecipients = (reviewRecipients.data?.data ?? []).filter(
    (recipient) => recipient.status === 'ineligible' && recipient.eligibility?.reasons.includes('consent_required'),
  );
  const selectedConsentCount = selectedConsentRecipientIds.length;
  const allVisibleConsentBlockedSelected = consentBlockedRecipients.length > 0
    && consentBlockedRecipients.every((recipient) => selectedConsentRecipientIds.includes(recipient._id));
  const openConsentVerification = () => {
    if (!selectedConsentRecipientIds.length) {
      setSelectedConsentRecipientIds(consentBlockedRecipients.map((recipient) => recipient._id));
    }
    setConsentDialogOpen(true);
  };

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
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><span>{consentBlocksReview
              ? `No recipients are eligible because verified ${channelMeta[channel].label} consent is missing. An administrator may record consent here only when valid evidence exists.`
              : 'No recipients are currently eligible. Review the exact reason shown beside each recipient before sending.'}</span>{canVerifyConsent && consentBlockedRecipients.length > 0 && <Button type="button" size="sm" variant="outline" className="shrink-0 border-destructive/30 bg-background text-foreground hover:bg-destructive/5" onClick={openConsentVerification}><ShieldCheck className="h-4 w-4" />Verify consent</Button>}</AlertDescription></Alert>
          )}
          {!done && (
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border/70 bg-muted/10 px-4 py-3.5">
                <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-4 w-4" /></span><div><p className="text-sm font-semibold">Snapshotted recipients</p><p className="text-xs text-muted-foreground">Inspect and remove recipients before the campaign enters the queue.</p></div></div>
                <div className="flex items-center gap-2">{canVerifyConsent && consentBlockedRecipients.length > 1 && <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground"><input type="checkbox" className="accent-primary" aria-label="Select all visible recipients requiring consent" checked={allVisibleConsentBlockedSelected} onChange={(event) => setSelectedConsentRecipientIds((current) => event.target.checked ? [...new Set([...current, ...consentBlockedRecipients.map((recipient) => recipient._id)])] : current.filter((id) => !consentBlockedRecipients.some((recipient) => recipient._id === id)))} />Select page</label>}{canVerifyConsent && consentBlockedRecipients.length > 0 && <Button type="button" size="xs" variant="outline" onClick={openConsentVerification}><ShieldCheck className="h-3.5 w-3.5" />{selectedConsentCount ? `Verify selected (${selectedConsentCount})` : 'Verify blocked'}</Button>}<span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{reviewRecipients.data?.pagination.total ?? campaign.summary.total} total</span></div>
              </div>
              <div className="max-h-52 divide-y divide-border overflow-y-auto">
                {(reviewRecipients.data?.data ?? []).map((recipient) => {
                  const lead = typeof recipient.leadId === 'object' ? recipient.leadId : null;
                  const reasons = recipient.eligibility?.reasons ?? [];
                  const eligible = recipient.eligibility?.eligible !== false && reasons.length === 0;
                  return (
                    <div key={recipient._id} className="group flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-muted/20">
                      <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${eligible ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{eligible ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{lead?.name || 'Lead'}</p><p className="truncate text-xs text-muted-foreground">{recipient.destination || `No ${channel === 'email' ? 'email address' : 'phone number'}`}</p>{reasons.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{reasons.map((reason) => <span key={reason} className="inline-flex rounded-full border border-amber-500/25 bg-amber-500/[0.08] px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">{eligibilityReasonLabel(reason, channel)}</span>)}</div>}</div></div>
                      <div className="flex shrink-0 items-center gap-1">{canVerifyConsent && reasons.includes('consent_required') && recipient.status === 'ineligible' && <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"><input type="checkbox" className="accent-primary" aria-label={`Select ${lead?.name || 'recipient'} for consent verification`} checked={selectedConsentRecipientIds.includes(recipient._id)} onChange={(event) => setSelectedConsentRecipientIds((current) => event.target.checked ? [...new Set([...current, recipient._id])] : current.filter((id) => id !== recipient._id))} /><span className="hidden sm:inline">Verify</span></label>}<Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${lead?.name || 'recipient'} from draft`} disabled={removeDraftRecipient.isPending} onClick={() => removeDraftRecipient.mutate(recipient._id)}><X className="h-4 w-4" /></Button></div>
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
            <div className="mt-4"><MessagePreview channel={channel} subject={subject} body={body} bodyHtml={bodyHtml} fallbackValues={fallbackValues} representative={representative} representativeName={representative?.name} templateName={selectedTemplate?.name} /></div>
          </div>
          <p className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />Consent and suppression are checked again immediately before each provider submission. Accepted does not mean delivered.</p>
        </DialogBody>
        <DialogFooter className="border-t border-border/70 bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
          {!done && <Button variant="outline" onClick={() => { setCampaign(null); setStep(2); }}><ChevronLeft className="h-4 w-4" /> Back</Button>}
          <Button variant={done ? 'default' : 'outline'} onClick={onClose}>{done ? 'Close' : 'Save draft'}</Button>
          {!done && <Button disabled={campaign.summary.eligible === 0 || start.isPending} onClick={() => start.mutate()}><Send className="h-4 w-4" />{scheduledAt ? 'Schedule campaign' : 'Confirm and send'}</Button>}
        </DialogFooter>
        <Dialog open={consentDialogOpen} onOpenChange={(next) => { if (!verifyConsent.isPending) setConsentDialogOpen(next); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Verify {channelMeta[channel].label} consent</DialogTitle><DialogDescription>Record evidence that applies to every selected recipient. Contact availability alone is not consent.</DialogDescription></DialogHeader>
            <DialogBody className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm"><span className="font-semibold">{selectedConsentCount || consentBlockedRecipients.length} {selectedConsentCount === 1 || (!selectedConsentCount && consentBlockedRecipients.length === 1) ? 'recipient' : 'recipients'}</span><span className="text-muted-foreground"> selected for administrator verification</span></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="campaign-consent-source">Evidence source</Label><Select value={consentSource} onValueChange={setConsentSource}><SelectTrigger id="campaign-consent-source" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="signed_form">Signed form</SelectItem><SelectItem value="web_form_opt_in">Web form opt-in</SelectItem><SelectItem value="verbal_confirmation">Verbal confirmation</SelectItem><SelectItem value="imported_record">Imported consent record</SelectItem><SelectItem value="manual_admin_verification">Administrator verification</SelectItem></SelectContent></Select></div><div><Label htmlFor="campaign-consent-captured">Evidence captured</Label><Input id="campaign-consent-captured" className="mt-1.5" type="datetime-local" value={consentCapturedAt} onChange={(event) => setConsentCapturedAt(event.target.value)} /></div></div>
              <div><Label htmlFor="campaign-consent-evidence">Verification evidence *</Label><Textarea id="campaign-consent-evidence" className="mt-1.5 min-h-28" maxLength={2000} value={consentEvidence} onChange={(event) => setConsentEvidence(event.target.value)} placeholder="Describe when, where, and how every selected recipient authorized this channel…" /><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>At least 10 characters; applies to every selected recipient</span><span>{consentEvidence.length}/2000</span></div></div>
              <div><Label htmlFor="campaign-consent-expiry">Expires (optional)</Label><Input id="campaign-consent-expiry" className="mt-1.5" type="datetime-local" min={toLocalDateTime()} value={consentExpiresAt} onChange={(event) => setConsentExpiresAt(event.target.value)} /></div>
              <label className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs leading-5"><input type="checkbox" className="mt-1 accent-primary" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} /><span>I confirm this evidence applies to every selected recipient and proves permission for {channelMeta[channel].label} outreach. This action is audit logged.</span></label>
            </DialogBody>
            <DialogFooter><Button variant="outline" disabled={verifyConsent.isPending} onClick={() => setConsentDialogOpen(false)}>Cancel</Button><Button disabled={verifyConsent.isPending || !selectedConsentCount || consentEvidence.trim().length < 10 || !consentCapturedAt || !consentConfirmed} onClick={() => verifyConsent.mutate()}><ShieldCheck className="h-4 w-4" />{verifyConsent.isPending ? 'Verifying…' : `Verify ${selectedConsentCount} ${selectedConsentCount === 1 ? 'recipient' : 'recipients'}`}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
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
                {channel === 'email' ? (
                  <EmailTemplateLibrary
                    templates={templates.data ?? []}
                    selectedId={templateId}
                    isLoading={templates.isLoading}
                    isError={templates.isError}
                    onSelect={chooseTemplate}
                    onRetry={() => { void templates.refetch(); }}
                  />
                ) : (
                  <div><Label>Template</Label><Select value={templateId} onValueChange={chooseTemplate}><SelectTrigger aria-label="Template" className="mt-1.5"><SelectValue placeholder="Choose a template" /></SelectTrigger><SelectContent><SelectItem value="custom">Custom message</SelectItem>{(templates.data ?? []).map((template) => <SelectItem key={template._id} value={template._id}>{template.name}{template.channel === 'whatsapp' ? ` · ${template.whatsapp?.approvalStatus || 'draft'}` : ''}</SelectItem>)}</SelectContent></Select></div>
                )}
                {channel === 'email' && <div><Label htmlFor={`${formId}-subject`}>Subject</Label><Input id={`${formId}-subject`} className="mt-1.5" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={500} placeholder="A concise, relevant subject" /></div>}
                {channel === 'email' && (
                  <PersonalizationFields
                    formId={formId}
                    values={fallbackValues}
                    usedVariables={personalizationVariables}
                    requiredVariables={selectedTemplate?.requiredVariables ?? personalizationVariables}
                    representative={representative}
                    onChange={(name, value) => setFallbackValues((current) => ({ ...current, [name]: value }))}
                  />
                )}
                {channel === 'whatsapp' ? (
                  <>
                    <Alert variant={selectedTemplate?.whatsapp?.approvalStatus === 'approved' ? 'default' : 'destructive'}><ShieldCheck className="h-4 w-4" /><AlertDescription>{selectedTemplate?.whatsapp?.approvalStatus === 'approved' ? `Approved Meta template: ${selectedTemplate?.whatsapp?.metaName} (${selectedTemplate?.whatsapp?.language})` : 'Select a Meta-approved WhatsApp template. Ordinary editable drafts cannot be sent as business-initiated messages.'}</AlertDescription></Alert>
                    {whatsappSlots.length > 0 && <div className="grid gap-3 rounded-xl border border-border bg-muted/10 p-4 sm:grid-cols-2"><div className="sm:col-span-2"><p className="text-sm font-semibold">Required template parameters</p><p className="text-xs text-muted-foreground">Map every approved placeholder in Meta&apos;s fixed parameter order.</p></div>{whatsappSlots.map((slot) => <div key={slot.key}><Label>{slot.label}</Label>{slot.parameterType === 'text' ? <Select value={(whatsappMappings[slot.key] || '').replace(/^\{\{|\}\}$/g, '')} onValueChange={(value) => setWhatsappMappings((current) => ({ ...current, [slot.key]: `{{${value}}}` }))}><SelectTrigger aria-label={slot.label} className="mt-1.5"><SelectValue placeholder="Choose personalization" /></SelectTrigger><SelectContent>{variables.map((variable) => <SelectItem key={variable} value={variable}>{`{{${variable}}}`}</SelectItem>)}</SelectContent></Select> : <Input aria-label={slot.label} className="mt-1.5" placeholder="https://..." value={whatsappMappings[slot.key] || ''} onChange={(event) => setWhatsappMappings((current) => ({ ...current, [slot.key]: event.target.value }))} />}</div>)}</div>}
                  </>
                ) : (
                  <div className="space-y-4">
                    <div><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={`${formId}-message`}>{channel === 'email' ? 'Plain-text fallback' : 'Message'}</Label>{channel === 'sms' && <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">{sms.length} characters · ~{sms.segments} segment{sms.segments === 1 ? '' : 's'}</span>}</div><Textarea aria-label="Message" id={`${formId}-message`} className="mt-1.5 min-h-36 resize-y leading-6" value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} placeholder="Write a clear, personal message…" /></div>
                    {channel === 'email' && (
                      <div className="overflow-hidden rounded-xl border border-border/80 bg-muted/[0.08]">
                        <button type="button" aria-expanded={showHtmlEditor} aria-controls={`${formId}-html-editor`} onClick={() => setShowHtmlEditor((visible) => !visible)} className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition hover:bg-muted/20">
                          <span className="flex min-w-0 items-center gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Code2 className="h-3.5 w-3.5" /></span><span className="min-w-0"><span className="block text-xs font-semibold">Advanced HTML editor</span><span className="block truncate text-[10px] text-muted-foreground">{bodyHtml.trim() ? 'Premium email design is active' : 'Optional custom email markup'}</span></span></span><span className="shrink-0 text-[10px] font-semibold text-primary">{showHtmlEditor ? 'Hide code' : 'Edit code'}</span>
                        </button>
                        {showHtmlEditor && (
                          <div id={`${formId}-html-editor`} className="border-t border-border/70 p-3">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="group" aria-label="HTML editor mode">
                                <button type="button" aria-pressed={htmlEditorMode === 'rendered'} onClick={() => setHtmlEditorMode('rendered')} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${htmlEditorMode === 'rendered' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Rendered values</button>
                                <button type="button" aria-pressed={htmlEditorMode === 'template'} onClick={() => setHtmlEditorMode('template')} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${htmlEditorMode === 'template' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Template source</button>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{htmlEditorMode === 'rendered' ? `Live values for ${representative?.name || 'the preview recipient'}` : 'Variables remain dynamic for every recipient'}</span>
                            </div>
                            {htmlEditorMode === 'rendered' ? (
                              <div><Label htmlFor={`${formId}-rendered-html`}>Rendered HTML output</Label><Textarea id={`${formId}-rendered-html`} readOnly className="mt-1.5 min-h-52 resize-y bg-muted/20 font-mono text-xs" value={renderPreview(bodyHtml, representative, fallbackValues)} /><p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">This read-only output updates instantly from the form and selected preview lead. The saved template source remains unchanged.</p></div>
                            ) : (
                              <div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><Label htmlFor={`${formId}-html`}>HTML template source</Label><span className="text-[10px] text-muted-foreground">Personalization is escaped server-side</span></div><Textarea id={`${formId}-html`} className="min-h-52 font-mono text-xs" value={bodyHtml} onChange={(event) => setBodyHtml(event.target.value)} maxLength={200000} placeholder={'<p>Hello {{firstName}},</p>\n<p>...</p>'} /></div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {channel !== 'whatsapp' && <div><p className="mb-2 text-xs font-medium text-muted-foreground">Insert personalization</p><div className="flex flex-wrap gap-1.5">{variables.map((variable) => <button key={variable} type="button" onClick={() => setBody((value) => `${value}{{${variable}}}`)} className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary">{`{{${variable}}}`}</button>)}</div></div>}
              </section>
            </div>
            <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
              <MessagePreview channel={channel} subject={subject} body={body} bodyHtml={bodyHtml} fallbackValues={fallbackValues} representative={representative} representativeName={representative?.name} templateName={selectedTemplate?.name} />
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
              <div className="relative"><MessagePreview channel={channel} subject={subject} body={body} bodyHtml={bodyHtml} fallbackValues={fallbackValues} representative={representative} representativeName={representative?.name || 'filtered recipient'} templateName={selectedTemplate?.name} />{activeLeads.length > 1 && <div className="absolute right-12 top-2.5 flex gap-0.5"><Button type="button" aria-label="Previous preview recipient" size="icon-sm" variant="ghost" onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button type="button" aria-label="Next preview recipient" size="icon-sm" variant="ghost" onClick={() => setPreviewIndex((index) => index + 1)}><ChevronRight className="h-4 w-4" /></Button></div>}</div>
            </aside>
          </div>
        )}
      </DialogBody>
      <DialogFooter className="isolate border-t border-border/70 bg-background px-5 py-4 sm:items-center sm:px-6">
        <div className="mr-auto hidden min-w-0 truncate text-xs text-muted-foreground sm:block">{!canContinue ? 'Complete the required fields to continue.' : step === 1 ? 'Message ready for recipient review.' : 'Selection ready for server verification.'}</div>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
          <Button className="flex-none !transition-colors" variant="ghost" onClick={onClose}>Cancel</Button>
          {step === 2 && <Button className="flex-none !transition-colors" variant="outline" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4" /> Back</Button>}
          {step === 1 ? (
            <Button key="outreach-recipients" className="w-[9.5rem] flex-none overflow-hidden !transition-colors" disabled={!canContinue} onClick={() => setStep(2)}>
              <span className="truncate">Recipients</span><ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button key="outreach-review" className="w-[10.5rem] flex-none overflow-hidden !transition-colors" disabled={!canContinue || createDraft.isPending} onClick={() => createDraft.mutate()}>
              <CheckCircle2 className="h-4 w-4" /><span className="truncate">Preview eligibility</span>
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  );
}
