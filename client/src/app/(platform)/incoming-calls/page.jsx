import { IncomingCallsWorkspace } from '@/modules/inboundCalls/ui/incoming-calls-workspace';

export const metadata = { title: 'Incoming Calls' };

// /incoming-calls?tab=live opens a section; ?call=<id> opens a call's details (useDrawer);
// ?agent=<id> opens that receptionist agent's workspace.
export default async function IncomingCallsPage({ searchParams }) {
  const { tab, call, agent } = await searchParams;
  const initialTab = typeof tab === 'string' ? tab : (typeof call === 'string' ? 'history' : 'overview');
  const agentId = typeof agent === 'string' && /^[a-f0-9]{24}$/i.test(agent) ? agent : null;
  return <IncomingCallsWorkspace key={agentId ?? 'workspace'} initialTab={agentId ? 'agents' : initialTab} initialAgentId={agentId} />;
}
