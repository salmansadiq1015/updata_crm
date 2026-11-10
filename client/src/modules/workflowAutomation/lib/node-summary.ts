import type { NodeConfig } from '../types/workflow-types';

type T = (key: string, fallback?: string, vars?: Record<string, unknown>) => string;
export interface SummaryLookups { agents: Map<string, string>; users: Map<string, string>; templates: Map<string, string>; agentLanguages?: Map<string, string> }

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const clip = (v: string, n = 70) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

interface Rule { field?: string; operator?: string; value?: unknown; rules?: Rule[]; op?: string }
function countRules(tree?: Rule): number {
  return (tree?.rules || []).reduce((sum, r) => sum + (Array.isArray(r.rules) ? countRules(r) : 1), 0);
}

/** One-line, human summary of a node's configuration for the canvas card. */
export function summarizeNode(type: string, config: NodeConfig, t: T, lookups: SummaryLookups): string {
  const c = config as Record<string, any>;
  const agent = c.agentId ? lookups.agents.get(String(c.agentId)) || t('workflowBuilder.summary.unknownAgent', 'Unknown agent') : '';
  switch (type) {
    case 'trigger.lead_updated':
      return c.toStatus ? t('workflowBuilder.summary.toStatus', 'Status becomes {status}', { status: t(`leads.status.${c.toStatus}`, c.toStatus) }) : (c.fields?.length ? c.fields.join(', ') : t('workflowBuilder.summary.anyChange', 'Any change'));
    case 'trigger.call_completed': return [t(`workflowBuilder.callOutcome.${c.outcome || 'any'}`, c.outcome), agent].filter(Boolean).join(' · ');
    case 'trigger.inbound_call': return t(`workflowBuilder.inboundOutcome.${c.outcome || 'any'}`, c.outcome);
    case 'trigger.message_received': return [c.channel === 'any' ? t('workflowBuilder.channel.any', 'Any channel') : t(`workflowBuilder.channel.${c.channel}`, c.channel), s(c.keyword) && `“${s(c.keyword)}”`].filter(Boolean).join(' · ');
    case 'trigger.message_status': return t(`workflowBuilder.messageStatus.${c.status || 'delivered'}`, c.status);
    case 'trigger.schedule': return c.time ? t('workflowBuilder.summary.schedule', '{time} · {count} leads max', { time: c.time, count: c.limit ?? 100 }) : '';
    case 'trigger.webhook': return t('workflowBuilder.summary.webhook', 'Secret URL');
    case 'ai.call': {
      if (!agent) return t('workflowBuilder.summary.chooseAgent', 'Choose an AI agent');
      const lang = lookups.agentLanguages?.get(String(c.agentId));
      return [
        t('workflowBuilder.summary.agentLine', 'Agent: {agent}', { agent }),
        lang && lang !== 'auto' ? t('workflowBuilder.summary.languageLine', 'Language: {language}', { language: lang.toUpperCase() }) : '',
        t('workflowBuilder.summary.attemptsLine', 'Max. attempts: {attempts}', { attempts: c.maxAttempts ?? 2 }),
      ].filter(Boolean).join('\n');
    }
    case 'crm.follow_up': return t('workflowBuilder.summary.followUp', 'Due in {hours} h · {channel}', { hours: c.dueInHours ?? 24, channel: t(`workflowBuilder.followUpChannel.${c.channel || 'phone'}`, c.channel || 'phone') });
    case 'crm.custom_fields': {
      const keys = (Array.isArray(c.set) ? c.set : []).map((r: { key?: string }) => r?.key).filter(Boolean);
      const removed = Array.isArray(c.remove) ? c.remove.length : 0;
      if (!keys.length && !removed) return t('workflowBuilder.summary.noCustomFields', 'No fields yet');
      return [keys.length ? keys.join(', ') : '', removed ? t('workflowBuilder.summary.customFieldsRemoved', '−{count} removed', { count: removed }) : ''].filter(Boolean).join(' · ');
    }
    case 'integration.webhook': { try { return c.url ? new URL(String(c.url)).host : t('workflowBuilder.summary.noUrl', 'No address yet'); } catch { return t('workflowBuilder.summary.noUrl', 'No address yet'); } }
    case 'ai.analyze': return t('workflowBuilder.summary.analyze', 'Uses the last AI call');
    case 'ai.callback': return agent ? t('workflowBuilder.summary.callbackAi', 'AI callback by {agent}', { agent }) : t('workflowBuilder.summary.callbackHuman', 'Callback task for a person');
    case 'msg.sms': case 'msg.email': case 'msg.whatsapp': {
      const tpl = c.templateId ? lookups.templates.get(String(c.templateId)) : '';
      return clip(tpl || s(c.subject) || s(c.body) || t('workflowBuilder.summary.noContent', 'No content yet'));
    }
    case 'notify.user': return clip(s(c.title) || t('workflowBuilder.summary.noContent', 'No content yet'));
    case 'task.create': return clip(s(c.title) || t('workflowBuilder.summary.noContent', 'No content yet'));
    case 'crm.update_lead': return [c.status && t(`leads.status.${c.status}`, c.status), c.pipelineStage].filter(Boolean).join(' · ') || t('workflowBuilder.summary.nothing', 'Nothing selected');
    case 'crm.add_tags': return [...(c.add || []).map((x: string) => `+${x}`), ...(c.remove || []).map((x: string) => `−${x}`)].join(' ') || t('workflowBuilder.summary.nothing', 'Nothing selected');
    case 'crm.assign': return c.userId ? lookups.users.get(String(c.userId)) || t('workflowBuilder.summary.unknownUser', 'Unknown user') : t('workflowBuilder.summary.chooseUser', 'Choose a user');
    case 'crm.add_note': return clip(s(c.text));
    case 'crm.qualification': return c.fieldKey ? `${t(`workflowBuilder.qualField.${c.fieldKey}`, c.fieldKey)} = ${clip(s(c.value), 40)}` : '';
    case 'logic.condition': {
      const n = countRules(c.rules);
      return n ? t('workflowBuilder.summary.rules', '{count} rule(s) · {op}', { count: n, op: c.rules?.op === 'or' ? t('workflowBuilder.condition.any', 'any') : t('workflowBuilder.condition.all', 'all') }) : t('workflowBuilder.summary.noRules', 'No rules yet');
    }
    case 'logic.delay': {
      if (c.mode === 'duration') return t('workflowBuilder.summary.delayDuration', 'Wait {amount} {unit}', { amount: c.amount ?? 1, unit: t(`workflowBuilder.unit.${c.unit || 'days'}`, c.unit) });
      if (c.mode === 'until') return t('workflowBuilder.summary.delayUntil', 'Until {date}', { date: c.until ? new Date(c.until).toLocaleString() : '—' });
      if (c.mode === 'time_of_day') return t('workflowBuilder.summary.delayTime', 'Until {time} (lead time)', { time: c.time || '09:00' });
      return t('workflowBuilder.summary.delayBusinessDay', 'Next business day {time}', { time: c.time || '09:00' });
    }
    case 'logic.wait_event': return t('workflowBuilder.summary.waitEvent', '{events} · max {hours} h', { events: (c.events || []).map((e: string) => t(`workflow.waitEvent.${e}`, e)).join(', '), hours: c.timeoutHours ?? 48 });
    case 'end': return t(`workflow.outcome.${c.outcome || 'completed'}`, c.outcome);
    default: return '';
  }
}
