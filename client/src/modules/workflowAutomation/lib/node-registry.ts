import {
  BadgeCheck, Bell, CalendarPlus, Globe, Bot, Brain, CalendarClock, CircleStop, Clock, FileUp, Flag, GitBranch, Hourglass, ListTodo, Mail,
  MessageCircle, MessageSquareText, MousePointerClick, NotebookPen, PhoneCall, PhoneIncoming, PhoneOutgoing, PlayCircle,
  RefreshCcw, Send, SlidersHorizontal, Tags, UserCheck, UserPlus, UserRoundPen, Webhook, type LucideIcon,
} from 'lucide-react';
import type { NodeCategory } from '../types/workflow-types';

export interface NodeVisual { icon: LucideIcon; category: NodeCategory }

/** Presentation metadata per node type (labels come from i18n: workflow.node.<type>.label / .desc). */
export const NODE_VISUALS: Record<string, NodeVisual> = {
  'trigger.manual': { icon: PlayCircle, category: 'trigger' },
  'trigger.lead_created': { icon: UserPlus, category: 'trigger' },
  'trigger.leads_imported': { icon: FileUp, category: 'trigger' },
  'trigger.lead_updated': { icon: UserRoundPen, category: 'trigger' },
  'trigger.call_completed': { icon: PhoneOutgoing, category: 'trigger' },
  'trigger.inbound_call': { icon: PhoneIncoming, category: 'trigger' },
  'trigger.message_received': { icon: MessageCircle, category: 'trigger' },
  'trigger.message_status': { icon: Send, category: 'trigger' },
  'trigger.link_clicked': { icon: MousePointerClick, category: 'trigger' },
  'trigger.webhook': { icon: Webhook, category: 'trigger' },
  'trigger.schedule': { icon: CalendarClock, category: 'trigger' },
  'ai.call': { icon: PhoneCall, category: 'ai' },
  'ai.analyze': { icon: Brain, category: 'ai' },
  'ai.callback': { icon: RefreshCcw, category: 'ai' },
  'msg.sms': { icon: MessageSquareText, category: 'communication' },
  'msg.whatsapp': { icon: MessageCircle, category: 'communication' },
  'msg.email': { icon: Mail, category: 'communication' },
  'notify.user': { icon: Bell, category: 'communication' },
  'task.create': { icon: ListTodo, category: 'crm' },
  'crm.update_lead': { icon: BadgeCheck, category: 'crm' },
  'crm.add_tags': { icon: Tags, category: 'crm' },
  'crm.assign': { icon: UserCheck, category: 'crm' },
  'crm.add_note': { icon: NotebookPen, category: 'crm' },
  'crm.qualification': { icon: Bot, category: 'crm' },
  'crm.follow_up': { icon: CalendarPlus, category: 'crm' },
  'crm.custom_fields': { icon: SlidersHorizontal, category: 'crm' },
  'integration.webhook': { icon: Globe, category: 'integration' },
  'logic.condition': { icon: GitBranch, category: 'logic' },
  'logic.delay': { icon: Clock, category: 'timing' },
  'logic.wait_event': { icon: Hourglass, category: 'timing' },
  end: { icon: Flag, category: 'end' },
};

export const FALLBACK_VISUAL: NodeVisual = { icon: CircleStop, category: 'logic' };
export const visualFor = (type: string): NodeVisual => NODE_VISUALS[type] || FALLBACK_VISUAL;

/** Palette order: Triggers → AI → Communication → CRM → Conditions → Delays & scheduling → Integrations → End states. */
export const CATEGORY_ORDER: NodeCategory[] = ['trigger', 'ai', 'communication', 'crm', 'logic', 'timing', 'integration', 'end'];

/** Tailwind classes per category. Brand = blue/cyan; never purple. */
export const CATEGORY_STYLES: Record<NodeCategory, { icon: string; ring: string; accent: string; dot: string; minimap: string }> = {
  trigger: { icon: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/40', accent: 'bg-emerald-500', dot: 'bg-emerald-500', minimap: '#10b981' },
  ai: { icon: 'bg-sky-500/12 text-sky-600 dark:text-sky-400', ring: 'ring-sky-500/40', accent: 'bg-sky-500', dot: 'bg-sky-500', minimap: '#0ea5e9' },
  communication: { icon: 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-400', ring: 'ring-cyan-500/40', accent: 'bg-cyan-500', dot: 'bg-cyan-500', minimap: '#06b6d4' },
  crm: { icon: 'bg-amber-500/12 text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/40', accent: 'bg-amber-500', dot: 'bg-amber-500', minimap: '#f59e0b' },
  logic: { icon: 'bg-blue-500/12 text-blue-600 dark:text-blue-400', ring: 'ring-blue-500/40', accent: 'bg-blue-600', dot: 'bg-blue-600', minimap: '#2563eb' },
  timing: { icon: 'bg-teal-500/12 text-teal-700 dark:text-teal-300', ring: 'ring-teal-500/40', accent: 'bg-teal-500', dot: 'bg-teal-500', minimap: '#14b8a6' },
  integration: { icon: 'bg-slate-500/12 text-slate-700 dark:text-slate-200', ring: 'ring-slate-500/40', accent: 'bg-slate-600', dot: 'bg-slate-600', minimap: '#475569' },
  end: { icon: 'bg-slate-500/12 text-slate-600 dark:text-slate-300', ring: 'ring-slate-500/40', accent: 'bg-slate-500', dot: 'bg-slate-500', minimap: '#64748b' },
};

/** Port colors: positive / negative / neutral branches read at a glance on the canvas. */
export function portTone(port: string): 'positive' | 'negative' | 'neutral' {
  if (['yes', 'answered', 'qualified', 'sent', 'matched', 'out'].includes(port)) return port === 'out' ? 'neutral' : 'positive';
  if (['no', 'failed', 'blocked', 'unanswered', 'not_qualified', 'timeout'].includes(port)) return 'negative';
  return 'neutral';
}
export const PORT_TONE_CLASSES = {
  positive: 'bg-emerald-500 text-emerald-700 dark:text-emerald-300',
  negative: 'bg-rose-500 text-rose-700 dark:text-rose-300',
  neutral: 'bg-slate-400 text-slate-600 dark:text-slate-300',
} as const;
export const PORT_EDGE_COLORS = { positive: '#10b981', negative: '#f43f5e', neutral: '#94a3b8' } as const;
