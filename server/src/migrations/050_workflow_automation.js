import {
  Workflow, WorkflowVersion, WorkflowRun, WorkflowEvent, WorkflowCampaign, WorkflowLink,
} from '../modules/workflowAutomation/workflow.models.js';
import Permission from '../modules/auth/permission.model.js';

/**
 * Workflow Automation: new collections + indexes and the workflow:* permissions.
 * Purely additive — no existing document is modified. The boot seed attaches the
 * permissions to the Admin role; other roles get them through role management.
 */
export const name = '050_workflow_automation';

export async function up() {
  for (const model of [Workflow, WorkflowVersion, WorkflowRun, WorkflowEvent, WorkflowCampaign, WorkflowLink]) await model.createIndexes();
  const permissions = {
    read: 'View workflow automations, executions, event history and analytics',
    write: 'Create and edit workflow automation drafts, validate and test them',
    publish: 'Publish, pause, archive and roll back workflow automations',
    execute: 'Run workflow campaigns and control individual executions',
  };
  for (const [action, description] of Object.entries(permissions)) {
    await Permission.updateOne({ module: 'workflow', action }, { $setOnInsert: { module: 'workflow', action, description } }, { upsert: true });
  }
}

// Keep automation history and permissions on rollback (the collections are inert without the module).
export async function down() {}

export default { name, up, down };
