import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { AnalyticsPage } from '@/modules/workflowAutomation/ui/pages/analytics-page';

export const metadata = { title: 'Workflow analytics' };

export default function Page() {
  return <AutomationRoute><AnalyticsPage /></AutomationRoute>;
}
