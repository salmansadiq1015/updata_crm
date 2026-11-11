import { WorkflowRun, WorkflowCampaign, WorkflowLink } from '../modules/workflowAutomation/workflow.models.js';
import logger from '../shared/logger/index.js';

/**
 * Workflow Automation read paths (overview, executions, campaigns, analytics).
 * Purely additive and idempotent: each index is created only when no index with the same
 * key pattern exists yet. No document is modified; no existing index is dropped.
 */
export const name = '056_workflow_read_indexes';

const INDEXES = [
  [WorkflowRun, { createdAt: -1 }, {}],
  [WorkflowRun, { workflowId: 1, createdAt: -1 }, {}],
  [WorkflowRun, { campaignId: 1, updatedAt: -1 }, {}],
  [WorkflowRun, { status: 1, completedAt: -1 }, { name: 'status_1_completedAt_-1_failed', partialFilterExpression: { status: 'failed' } }],
  [WorkflowCampaign, { createdAt: -1 }, {}],
  [WorkflowCampaign, { status: 1, createdAt: -1 }, {}],
  [WorkflowLink, { createdAt: -1 }, {}],
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function existing(model) {
  try { return await model.collection.indexes(); } catch { return []; } // collection may not exist yet
}

export async function up() {
  for (const [model, key, options] of INDEXES) {
    if ((await existing(model)).some((i) => sameKey(i.key, key))) continue;
    await model.collection.createIndex(key, { background: true, ...options });
    logger.info('Workflow read index created', { module: 'migration', collection: model.collection.name, key });
  }
}

export async function down() {
  for (const [model, key] of INDEXES) {
    const index = (await existing(model)).find((i) => sameKey(i.key, key));
    if (index) await model.collection.dropIndex(index.name);
  }
}

export default { name, up, down };
