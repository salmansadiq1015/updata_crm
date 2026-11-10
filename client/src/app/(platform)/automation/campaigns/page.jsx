import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { CampaignsPage } from '@/modules/workflowAutomation/ui/pages/campaigns-page';

export const metadata = { title: 'Workflow campaigns' };

export default function Page() {
  return <AutomationRoute><CampaignsPage /></AutomationRoute>;
}
