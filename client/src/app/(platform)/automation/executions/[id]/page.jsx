import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { ExecutionInspectorPage } from '@/modules/workflowAutomation/ui/pages/execution-inspector-page';

export const metadata = { title: 'Workflow execution' };

export default async function Page({ params }) {
  const { id } = await params;
  return <AutomationRoute><ExecutionInspectorPage id={id} /></AutomationRoute>;
}
