'use client';
import { PermissionGate } from '@/shared/components/permission-gate';
import { useLanguage } from '@/lib/i18n/language-context';
import { WorkflowBuilder } from './workflow-builder';

/** Route entry: permission gate + the full-height builder. */
export function WorkflowBuilderPage({ workflowId }: { workflowId: string }) {
  const { t } = useLanguage();
  return (
    <PermissionGate permission="workflow:read" fallback={<p className="p-6 text-sm text-muted-foreground">{t('workflow.common.noAccess', 'You don’t have access to workflow automation.')}</p>}>
      <WorkflowBuilder workflowId={workflowId} />
    </PermissionGate>
  );
}
