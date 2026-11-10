import { AutomationRoute } from '@/modules/workflowAutomation/ui/pages/route-gate';
import { CampaignDetailPage } from '@/modules/workflowAutomation/ui/pages/campaign-detail-page';

export const metadata = { title: 'Workflow campaign' };

export default async function Page({ params }) {
  const { id } = await params;
  return <AutomationRoute><CampaignDetailPage id={id} /></AutomationRoute>;
}
