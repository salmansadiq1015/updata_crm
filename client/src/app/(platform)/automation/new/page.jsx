import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { NewWorkflowPage } from '@/modules/workflowAutomation/ui/pages/new-workflow-page';

export const metadata = { title: 'Create workflow' };

export default function Page() {
  return <AutomationRoute><NewWorkflowPage /></AutomationRoute>;
}
