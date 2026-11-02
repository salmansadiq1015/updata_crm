import { AiCallingWorkspace } from '@/modules/aiCalling/ui/ai-calling-workspace';

export const metadata = { title: 'AI Voice Calling' };

export default async function AiCallingPage({ searchParams }) {
  const { agent } = await searchParams;
  const agentId = typeof agent === 'string' ? agent : null;
  return <AiCallingWorkspace key={agentId ?? 'agents'} initialAgentId={agentId} />;
}
