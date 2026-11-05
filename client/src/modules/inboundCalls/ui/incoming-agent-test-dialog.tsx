'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useInboundLanguage } from './use-inbound-language';
import { AgentDialog, secondaryClass } from '@/modules/aiCalling/ui/calling-agent-primitives';
import { inboundCallsApi } from '../services/inbound-calls-api';

const WebCallConsole = dynamic(() => import('@/modules/aiCalling/ui/web-call-console').then((m) => m.WebCallConsole), { ssr: false });

/**
 * Talk to an incoming agent from the browser as if you were calling the phone. Runs the real
 * receptionist (same worker, tools and post-call analysis); recorded as a test only, so it never
 * creates or changes leads, follow-ups, history or analytics.
 */
export function IncomingAgentTestDialog({ agentId, agentName, onClose }: { agentId: string; agentName: string; onClose: () => void }) {
  const { t } = useInboundLanguage();
  const [callRecordId, setCallRecordId] = useState<string | null>(null);
  const start = async () => {
    const session = await inboundCallsApi.startAgentTest(agentId);
    setCallRecordId(session.id);
    return { callId: session.callId, url: session.url, token: session.token };
  };
  return (
    <AgentDialog
      title={t('inbound.agentTest.title', 'Test {name} as a caller', { name: agentName })}
      description={t('inbound.agentTest.hint', 'You are the caller. The agent greets you like an incoming call. This is a test: no lead, follow-up or history entry is created.')}
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <WebCallConsole campaignId={`inbound-test-${agentId}`} agentName={agentName} startSession={start} />
        {callRecordId ? (
          <Link href={`/incoming-calls?call=${callRecordId}`} className={`${secondaryClass} w-fit text-xs`}>
            {t('inbound.agentTest.results', 'Transcript, collected details and summary')} <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </AgentDialog>
  );
}
