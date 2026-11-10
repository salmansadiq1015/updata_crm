import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { OverviewPage } from '@/modules/workflowAutomation/ui/pages/overview-page';

export const metadata = { title: 'Workflow Automation' };

export default function Page() {
  return <AutomationRoute><OverviewPage /></AutomationRoute>;
}
