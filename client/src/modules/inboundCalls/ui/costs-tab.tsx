'use client';

import { useState } from 'react';
import { AgentCallAnalytics } from '@/modules/aiCalling/ui/agent-call-analytics';
import { useAssignableAgents } from '../hooks/use-inbound-calls';
import { selectClass } from './inbound-primitives';
import { useInboundLanguage } from './use-inbound-language';

/** Incoming-call cost management: the AI Calling "Call analytics" view, scoped to incoming calls. */
export function CostsTab() {
  const { t } = useInboundLanguage();
  const [agentId, setAgentId] = useState('');
  const { agents } = useAssignableAgents();
  // Receptionists first; legacy/outbound agents can still have answered calls in the past.
  const sorted = [...agents].sort((a, b) => Number(b.usage === 'inbound' || b.usage === 'both') - Number(a.usage === 'inbound' || a.usage === 'both') || a.name.localeCompare(b.name));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">{t('inbound.costs.agentFilter', 'Agent')}
          <select aria-label={t('inbound.costs.agentFilter', 'Agent')} className={selectClass} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">{t('inbound.filter.allAgents', 'All agents')}</option>
            {sorted.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      <AgentCallAnalytics key={agentId || 'all'} source={{ kind: 'inbound', agentId: agentId || null }} onAgent={setAgentId} />
    </div>
  );
}
