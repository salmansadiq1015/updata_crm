import { WorkflowBuilderPage } from '@/modules/workflowAutomation/ui/builder/workflow-builder-page';

export const metadata = { title: 'Workflow builder' };

export default async function WorkflowBuilderRoute({ params }) {
  const { id } = await params;
  return <WorkflowBuilderPage key={id} workflowId={id} />;
}
