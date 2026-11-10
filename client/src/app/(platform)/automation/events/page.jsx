import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { EventsPage } from '@/modules/workflowAutomation/ui/pages/events-page';

export const metadata = { title: 'Workflow event history' };

export default function Page() {
  return <AutomationRoute><EventsPage /></AutomationRoute>;
}
