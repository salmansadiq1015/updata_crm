import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { ExecutionsPage } from '@/modules/workflowAutomation/ui/pages/executions-page';

export const metadata = { title: 'Workflow executions' };

export default function Page() {
  return <AutomationRoute><ExecutionsPage /></AutomationRoute>;
}
