import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { TemplatesPage } from '@/modules/workflowAutomation/ui/pages/templates-page';

export const metadata = { title: 'Workflow templates' };

export default function Page() {
  return <AutomationRoute><TemplatesPage /></AutomationRoute>;
}
