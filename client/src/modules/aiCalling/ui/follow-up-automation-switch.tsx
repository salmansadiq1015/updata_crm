'use client';
import { useState } from 'react';
import { BellRing, Loader2, Pause, PhoneForwarded, Play, X } from 'lucide-react';
import { useWorkspaceUsers } from '@/modules/tasks/hooks/use-workspace-users';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useIntelT } from '../hooks/use-intel-t';
import { useFollowUpActions, useFollowUpSettings } from '../hooks/use-follow-up-calling';

/**
 * Organisation-wide switch for AUTOMATIC AI follow-up calls (off by default). While off, no
 * agent places a follow-up call on its own; scheduled AI follow-ups wait and "Call now" still
 * works. Needs ai-calling:admin to change; the voice kill switch above still overrides it.
 */
export function FollowUpAutomationSwitch() {
  const t = useIntelT();
  const { data: s } = useFollowUpSettings();
  const { setAutomation } = useFollowUpActions();
  const { isAdmin, hasPermission } = usePermissions();
  if (!s) return null;
  const canAdmin = isAdmin || hasPermission('ai-calling:admin');
  return <div role="region" aria-label={t('aiFollowUp.switch.label', 'Automatic follow-up calls')}
    className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5 text-sm ${s.enabled ? 'border-border bg-card' : 'border-amber-500/25 bg-amber-500/5'}`}>
    <span className="flex items-center gap-2">
      <PhoneForwarded className="h-4 w-4 text-brand-500" aria-hidden="true" />
      <span className="font-medium">{t('aiFollowUp.switch.label', 'Automatic follow-up calls')}</span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.enabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.enabled ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
        {s.enabled ? t('aiFollowUp.on', 'On') : t('aiFollowUp.off', 'Off')}
      </span>
    </span>
    <span className="min-w-0 basis-full text-xs text-muted-foreground sm:basis-auto sm:flex-1">
      {s.enabled ? t('aiFollowUp.switch.onHint', 'Agents with automatic follow-up calls call due follow-ups within their calling hours.')
        : t('aiFollowUp.switch.offHint', 'No agent places a follow-up call on its own. Scheduled AI follow-ups wait; "Call now" still works.')}
    </span>
    {s.forcedOffByEnv ? <span className="text-xs text-muted-foreground">{t('aiFollowUp.status.forcedOff', 'Turned off by a server setting')}</span>
      : canAdmin && <button type="button" onClick={() => setAutomation.mutate({ enabled: !s.enabled })} disabled={setAutomation.isPending}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-60 ${s.enabled ? 'border border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-300' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
        {setAutomation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : s.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {s.enabled ? t('aiFollowUp.switch.turnOff', 'Turn off') : t('aiFollowUp.switch.turnOn', 'Turn on')}
      </button>}
    {canAdmin && <DefaultEscalationRecipients ids={s.escalationUserIds || []} />}
  </div>;
}

/** Organisation default escalation recipients (used by agents that name none). Admin only. */
function DefaultEscalationRecipients({ ids }: { ids: string[] }) {
  const t = useIntelT();
  const users = useWorkspaceUsers();
  const { setEscalationRecipients } = useFollowUpActions();
  const [pick, setPick] = useState('');
  const list = users.data || [];
  const name = (id: string) => {
    const u = list.find((x) => x.id === id);
    return u ? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email) : t('aiFollowUp.escalation.unknownUser', 'Unknown user');
  };
  const save = (next: string[]) => setEscalationRecipients.mutate(next);
  return <div className="flex basis-full flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
    <span className="flex items-center gap-1.5 font-medium text-muted-foreground"><BellRing className="h-3.5 w-3.5" aria-hidden="true" />{t('aiFollowUp.switch.defaultRecipients', 'Default escalation recipients')}</span>
    {ids.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">{name(id)}
      <button type="button" aria-label={t('aiFollowUp.escalation.removeUser', 'Remove {name}', { name: name(id) })} disabled={setEscalationRecipients.isPending} onClick={() => save(ids.filter((x) => x !== id))}><X className="h-3 w-3" /></button></span>)}
    {!ids.length && <span className="text-muted-foreground">{t('aiFollowUp.switch.noDefaultRecipients', 'None — escalations go to the follow-up owner.')}</span>}
    <select aria-label={t('aiFollowUp.escalation.add', 'Add recipient')} className="h-8 rounded-lg border border-border bg-card px-2" value={pick} disabled={setEscalationRecipients.isPending}
      onChange={(e) => { const id = e.target.value; setPick(''); if (id && !ids.includes(id)) save([...ids, id]); }}>
      <option value="">{t('aiFollowUp.escalation.add', 'Add recipient')}</option>
      {list.filter((u) => !ids.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}</option>)}
    </select>
  </div>;
}
