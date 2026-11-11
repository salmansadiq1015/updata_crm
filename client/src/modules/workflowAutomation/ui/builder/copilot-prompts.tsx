'use client';
import { useState } from 'react';
import {
  BookOpen, Bug, CalendarClock, GitBranch, HelpCircle, Mail, MessageSquareText, PhoneCall, PhoneMissed, PlayCircle, Repeat, Settings2,
  ShieldCheck, Sparkles, Tags, UserCheck, type LucideIcon,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

/**
 * Predefined prompts for the Workflow Copilot.
 *   quick prompts  context-aware chips above the composer (send immediately)
 *   prompt library categorised, proven prompts (inserted into the composer so they can be adjusted)
 */
export interface QuickPrompt { id: string; label: string; prompt: string; icon: LucideIcon; action?: 'demo' }
interface Ctx { nodeCount: number; selectedLabel: string | null; issueCount: number }
type T = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => string;

export function quickPromptsFor({ nodeCount, selectedLabel, issueCount }: Ctx, t: T): QuickPrompt[] {
  const p = (id: string, icon: LucideIcon, label: string, prompt: string, vars?: Record<string, unknown>): QuickPrompt => ({
    id, icon, label: t(`workflowCopilot.quick.${id}`, label, vars), prompt: t(`workflowCopilot.quick.${id}Prompt`, prompt, vars),
  });
  if (selectedLabel) {
    return [
      p('configure', Settings2, 'Configure “{name}”', 'Help me configure the step “{name}”.', { name: selectedLabel }),
      p('after', GitBranch, 'Add a step after it', 'Add the right next step after “{name}” and connect all of its branches.', { name: selectedLabel }),
      p('explainStep', HelpCircle, 'What does it do?', 'Explain what the step “{name}” does and what each of its branches means.', { name: selectedLabel }),
      ...(issueCount ? [p('fix', Bug, 'Fix problems ({count})', 'Check this workflow and fix all problems.', { count: issueCount })] : []),
    ];
  }
  if (!nodeCount) {
    return [
      { ...p('qualify', PhoneCall, 'AI lead qualification', 'Create an AI lead qualification workflow for new leads: call them, analyse the answers, notify sales for qualified leads and end every branch correctly.'), },
      p('missed', PhoneMissed, 'Missed call → SMS', 'When an incoming call is missed, send the lead an SMS, wait 24 hours for a reply and create a task for sales if nobody answers.'),
      p('nurture', Mail, 'Email follow-up', 'For imported leads, send a follow-up email with open tracking, wait 3 days and call the leads who opened it.'),
      { ...p('demo', PlayCircle, 'Show me a demo', ''), action: 'demo' },
    ];
  }
  return [
    ...(issueCount ? [p('fix', Bug, 'Fix problems ({count})', 'Check this workflow and fix all problems.', { count: issueCount })] : []),
    p('explain', HelpCircle, 'Explain this workflow', 'Explain what this workflow does, step by step, in simple words.'),
    p('retries', Repeat, 'Retry unanswered calls', 'Retry unanswered calls after 24 hours, at most 3 times, then end as unreachable.'),
    p('multichannel', MessageSquareText, 'Add SMS + email', 'If the lead does not answer the call, follow up by SMS and email, respecting consent.'),
    ...(issueCount ? [] : [p('check', ShieldCheck, 'Check before publishing', 'Check this workflow before I publish it and tell me what could still go wrong.')]),
  ];
}

interface LibraryItem { id: string; icon: LucideIcon; label: string; prompt: string }
const LIBRARY: Array<{ id: string; label: string; items: LibraryItem[] }> = [
  { id: 'build', label: 'Build a workflow', items: [
    { id: 'qualify', icon: PhoneCall, label: 'AI lead qualification', prompt: 'Create an AI lead qualification workflow for new leads: call them with my AI agent, analyse the answers, notify sales for qualified leads, schedule a callback when requested and end every branch correctly.' },
    { id: 'missed', icon: PhoneMissed, label: 'Missed call recovery', prompt: 'When an incoming call is missed, send an SMS within minutes, wait 24 hours for a reply, notify the assigned rep on a reply and create a follow-up task otherwise.' },
    { id: 'reactivation', icon: CalendarClock, label: 'Re-activate old leads', prompt: 'Every Monday at 9:00, take up to 50 leads tagged "cold", call them with my AI agent and tag the interested ones "warm".' },
    { id: 'webhook', icon: Sparkles, label: 'Website form → call', prompt: 'When my website form sends a webhook, call the lead within 5 minutes with my AI agent and notify sales if they are interested.' },
  ] },
  { id: 'improve', label: 'Improve this workflow', items: [
    { id: 'retries', icon: Repeat, label: 'Bounded call retries', prompt: 'Retry unanswered calls after 24 hours, at most 3 times, then end as unreachable.' },
    { id: 'businessHours', icon: CalendarClock, label: 'Only during business hours', prompt: 'Make every call and message wait for business hours (Mon–Fri, 08:00–18:00 in the lead’s time zone).' },
    { id: 'handoff', icon: UserCheck, label: 'Hand over to a person', prompt: 'When the AI cannot qualify the lead, create a task for the assigned rep with a short summary of the call.' },
    { id: 'tags', icon: Tags, label: 'Tag the outcome', prompt: 'Tag every lead with the outcome of this workflow (qualified, not interested, unreachable) and record it as a custom field "workflow_outcome".' },
  ] },
  { id: 'channels', label: 'Channels', items: [
    { id: 'sms', icon: MessageSquareText, label: 'SMS follow-up', prompt: 'After the call, send interested leads an SMS with a tracked link and continue when they click it.' },
    { id: 'email', icon: Mail, label: 'Email with open tracking', prompt: 'Send a follow-up email with open tracking; if it is opened within 3 days call the lead, otherwise send one reminder.' },
    { id: 'whatsapp', icon: MessageSquareText, label: 'WhatsApp message', prompt: 'Send qualified leads a WhatsApp message using an approved template and notify sales.' },
  ] },
  { id: 'check', label: 'Explain & check', items: [
    { id: 'explain', icon: HelpCircle, label: 'Explain in simple words', prompt: 'Explain what this workflow does, step by step, in simple words.' },
    { id: 'audit', icon: ShieldCheck, label: 'Pre-publish review', prompt: 'Review this workflow before I publish: unconnected branches, missing agents or templates, consent, loops and end states. Fix what you can.' },
    { id: 'whatIf', icon: GitBranch, label: 'What if the lead says no?', prompt: 'Walk me through what happens when the lead is not interested, does not answer, or opts out.' },
  ] },
];

export function QuickPrompts({ items, disabled, onSend, onDemo }: { items: QuickPrompt[]; disabled: boolean; onSend: (prompt: string) => void; onDemo?: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" role="group" aria-label={t('workflowCopilot.quick.aria', 'Suggested prompts')}>
      {items.map(({ id, label, prompt, icon: Icon, action }) => (
        <button key={id} type="button" disabled={disabled || (action === 'demo' && !onDemo)} onClick={() => (action === 'demo' ? onDemo?.() : onSend(prompt))} title={prompt || label}
          className={cn('group inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground/85 transition-all',
            'hover:-translate-y-px hover:border-sky-500/50 hover:bg-sky-500/[0.07] hover:text-foreground hover:shadow-[0_4px_14px_-6px_rgb(14_165_233/0.5)] disabled:pointer-events-none disabled:opacity-50',
            action === 'demo' && 'border-sky-500/40 text-sky-700 dark:text-sky-300')}>
          <Icon className="size-3.5 text-sky-600 transition-transform group-hover:scale-110 dark:text-sky-300" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

export function PromptLibrary({ disabled, onPick }: { disabled: boolean; onPick: (prompt: string) => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} aria-label={t('workflowCopilot.library.open', 'Prompt library')} title={t('workflowCopilot.library.open', 'Prompt library')}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
          <BookOpen className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[340px] p-0">
        <div className="border-b px-3.5 py-2.5">
          <p className="text-sm font-semibold">{t('workflowCopilot.library.title', 'Prompt library')}</p>
          <p className="text-[11px] text-muted-foreground">{t('workflowCopilot.library.hint', 'Proven requests — pick one, adjust it, send.')}</p>
        </div>
        <div className="max-h-[380px] overflow-y-auto p-1.5">
          {LIBRARY.map((group) => (
            <div key={group.id} className="mb-1">
              <p className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{t(`workflowCopilot.library.${group.id}`, group.label)}</p>
              {group.items.map(({ id, icon: Icon, label, prompt }) => (
                <button key={id} type="button" onClick={() => { onPick(t(`workflowCopilot.library.${group.id}.${id}Prompt`, prompt)); setOpen(false); }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-sky-500/[0.07]">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-300"><Icon className="size-3.5" /></span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{t(`workflowCopilot.library.${group.id}.${id}`, label)}</span>
                    <span className="line-clamp-2 block text-[11px] leading-4 text-muted-foreground">{t(`workflowCopilot.library.${group.id}.${id}Prompt`, prompt)}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Every translation key the prompts use (the i18n test checks them). */
export const PROMPT_KEYS = [
  ...['configure', 'after', 'explainStep', 'fix', 'qualify', 'missed', 'nurture', 'explain', 'retries', 'multichannel', 'check']
    .flatMap((id) => [`workflowCopilot.quick.${id}`, `workflowCopilot.quick.${id}Prompt`]),
  'workflowCopilot.quick.demo',
  ...LIBRARY.flatMap((g) => [`workflowCopilot.library.${g.id}`, ...g.items.flatMap((i) => [`workflowCopilot.library.${g.id}.${i.id}`, `workflowCopilot.library.${g.id}.${i.id}Prompt`])]),
];
