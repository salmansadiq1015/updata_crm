'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, Check, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useAgentMutations, useAllCallingAgents } from '@/modules/aiCalling/hooks/use-calling-agents';
import {
  Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useLanguage,
} from './lead-ui-kit';

/** Assignments belong to calling agents, independently of the lead's human owner. */
export function LeadAiCalling({ leadId }: { leadId: string }) {
  const { t } = useLanguage();
  const { isAdmin, hasPermission } = usePermissions();
  const canRead = isAdmin || hasPermission('ai-calling:read');
  const canAssign = isAdmin || hasPermission('ai-calling:write');
  const agents = useAllCallingAgents(canRead);
  const { assign } = useAgentMutations();
  const [selectedId, setSelectedId] = useState('');
  const assigned = (agents.data ?? []).filter(agent => agent.assignedLeadIds.includes(leadId));
  const selected = agents.data?.find(agent => agent._id === selectedId);
  const selectable = selected && selected.availability !== 'archived' && selected.assignedLeadIds.length < 500;

  return (
    <section aria-label={t('leads.aiCalling.title', 'AI calling agent')} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
          <Bot className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{t('leads.aiCalling.title', 'AI calling agent')}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {assigned.length ? t('leads.aiCalling.assigned', 'Assigned to this lead') : t('leads.aiCalling.unassigned', 'Choose an agent to handle this lead’s AI calls.')}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {!canRead ? (
          <p className="text-sm text-muted-foreground">{t('leads.aiCalling.noAccess', 'You do not have access to calling agents.')}</p>
        ) : agents.isPending ? (
          <div role="status" className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t('leads.aiCalling.loading', 'Loading calling agents…')}</div>
        ) : agents.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t('leads.aiCalling.loadError', 'Calling agents could not be loaded.')}</p>
            <Button variant="outline" size="sm" onClick={() => void agents.refetch()}><RefreshCw className="size-3.5" aria-hidden="true" />{t('common.retry', 'Retry')}</Button>
          </div>
        ) : assigned.length ? (
          <ul className="space-y-3">
            {assigned.map(agent => (
              <li key={agent._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="min-w-0 flex-1 basis-36">
                  <p className="break-words text-sm font-semibold">{agent.name}</p>
                  {agent.title && <p className="mt-0.5 break-words text-xs text-muted-foreground">{agent.title}</p>}
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3.5 text-primary" aria-hidden="true" />{t('leads.aiCalling.assignedLabel', 'Assigned')}<span aria-hidden="true">·</span><span className="capitalize">{agent.availability}</span></p>
                </div>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={`/ai-calling?agent=${encodeURIComponent(agent._id)}`}>
                    {t('leads.aiCalling.openAgent', 'Open agent')}<ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : !agents.data?.length ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('leads.aiCalling.empty', 'No calling agents yet. Create one to assign this lead.')}</p>
            <Button asChild variant="outline" size="sm"><Link href="/ai-calling">{t('leads.aiCalling.manage', 'Manage calling agents')}<ExternalLink className="size-3.5" aria-hidden="true" /></Link></Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1">
                <Select value={selectedId} onValueChange={value => { setSelectedId(value); assign.reset(); }} disabled={!canAssign || assign.isPending}>
                  <SelectTrigger aria-label={t('leads.aiCalling.select', 'Calling agent')}><SelectValue placeholder={t('leads.aiCalling.placeholder', 'Select an AI calling agent')} /></SelectTrigger>
                  <SelectContent>
                    {(agents.data ?? []).map(agent => (
                      <SelectItem key={agent._id} value={agent._id} textValue={agent.name} disabled={agent.availability === 'archived' || agent.assignedLeadIds.length >= 500}>
                        <span className="truncate">{agent.name}</span><span className="text-xs capitalize text-muted-foreground">{agent.availability}{agent.assignedLeadIds.length >= 500 ? ` · ${t('leads.aiCalling.full', 'Full')}` : ''}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="h-10 gap-1.5" disabled={!canAssign || !selectable || assign.isPending || agents.isFetching} onClick={() => {
                if (!selected || !selectable) return;
                assign.mutate({ id: selected._id, leadIds: [leadId], version: selected.version, mode: 'add' }, {
                  onError: () => { void agents.refetch(); },
                });
              }}>
                {assign.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Bot className="size-4" aria-hidden="true" />}
                {assign.isPending ? t('leads.aiCalling.assigning', 'Assigning…') : t('leads.aiCalling.assign', 'Assign agent')}
              </Button>
            </div>
            {!canAssign && <p className="text-xs text-muted-foreground">{t('leads.aiCalling.readOnly', 'You need calling agent edit access to assign this lead.')}</p>}
            {assign.isError && <p role="alert" className="text-xs text-destructive">{t('leads.aiCalling.assignError', 'Assignment could not be saved. Review the refreshed agent and try again.')}</p>}
            <p className="text-xs leading-relaxed text-muted-foreground">{t('leads.aiCalling.hint', 'Assignment saves this lead to the agent. Open the agent to review calling settings and launch calls.')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
