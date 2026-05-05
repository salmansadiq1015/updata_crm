/**
 * Workflow registry — maps workflow type strings to compiled LangGraph graphs.
 *
 * LEAD_CREATION and INVOICE_GENERATION are intentionally omitted: the
 * corresponding service modules do not exist in this codebase yet.
 */
import { taskWorkflow } from './task.workflow.js';
import { notificationWorkflow } from './notification.workflow.js';
import { generalWorkflow } from './general.workflow.js';

const WORKFLOW_REGISTRY = {
  TASK_AUTOMATION: taskWorkflow,
  NOTIFICATION: notificationWorkflow,
  GENERAL: generalWorkflow,
};

/**
 * Retrieve a compiled workflow by its type key.
 * Returns null for unknown workflow types — callers must handle this case.
 *
 * @param {string} workflowType
 * @returns {import('@langchain/langgraph').CompiledStateGraph | null}
 */
export function getWorkflow(workflowType) {
  return WORKFLOW_REGISTRY[workflowType] || null;
}

export { WORKFLOW_REGISTRY };
