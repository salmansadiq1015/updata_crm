import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { WorkflowsListPage } from '@/modules/workflowAutomation/ui/pages/workflows-list-page';

export const metadata = { title: 'Workflows' };

export default function Page() {
  return <AutomationRoute><WorkflowsListPage /></AutomationRoute>;
}
