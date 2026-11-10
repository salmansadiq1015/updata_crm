/**
 * Workflow Automation persistence.
 *
 *  Workflow          editable definition (draft graph) + pointer to the published version
 *  WorkflowVersion   immutable published snapshot — runs execute exactly this graph
 *  WorkflowRun       one contact's execution: persistent state machine (survives restarts)
 *  WorkflowEvent     append-only unified event/timeline log (dedupeKey makes writes idempotent)
 *  WorkflowCampaign  enrollment batch of leads into a published workflow version
 *  WorkflowLink      tracked link (click → event → redirect)
 */
import mongoose from 'mongoose';
import {
  CAMPAIGN_STATUSES, END_OUTCOMES, RUN_STATUSES, STEP_STATUSES, WORKFLOW_STATUSES,
} from './workflow.constants.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

// ------------------------------------------------------------------------------ Workflow
const workflowSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 2000 },
  status: { type: String, enum: WORKFLOW_STATUSES, default: 'draft', index: true },
  draft: { type: Mixed, default: () => ({ nodes: [], edges: [] }) },
  // Optimistic concurrency for the editor: a save must carry the revision it was based on.
  draftRevision: { type: Number, default: 0 },
  draftUpdatedAt: { type: Date, default: Date.now },
  publishedVersionId: { type: ObjectId, ref: 'WorkflowVersion', default: null },
  publishedVersion: { type: Number, default: null },
  latestVersion: { type: Number, default: 0 },
  publishedAt: { type: Date, default: null },
  // Denormalized from the PUBLISHED version for fast event → workflow matching.
  triggerType: { type: String, default: null },
  triggerConfig: { type: Mixed, default: null },
  // Schedule triggers: next firing instant (sweep claims it with a CAS on this field).
  nextFireAt: { type: Date, default: null },
  settings: {
    // never: a lead runs this workflow once; after_completion: again once the previous run ended;
    // always: concurrent runs allowed (still deduped per triggering event).
    reentry: { type: String, enum: ['never', 'after_completion', 'always'], default: 'after_completion' },
    // Cancel the run as soon as the lead opts out on any channel.
    stopOnOptOut: { type: Boolean, default: true },
  },
  templateKey: { type: String, default: null, maxlength: 80 },
  // A workflow saved as a reusable template (listed with the built-in templates).
  isTemplate: { type: Boolean, default: false },
  tags: { type: [String], default: [] },
  createdBy: { type: ObjectId, ref: 'User', required: true, index: true },
  updatedBy: { type: ObjectId, ref: 'User', default: null },
  archivedAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });
workflowSchema.index({ status: 1, triggerType: 1 });
workflowSchema.index({ status: 1, nextFireAt: 1 }, { partialFilterExpression: { nextFireAt: { $type: 'date' } } });
workflowSchema.index({ updatedAt: -1 });

// ------------------------------------------------------------------------------ Version
const versionSchema = new mongoose.Schema({
  workflowId: { type: ObjectId, ref: 'Workflow', required: true },
  version: { type: Number, required: true },
  graph: { type: Mixed, required: true },
  triggerType: { type: String, required: true },
  triggerConfig: { type: Mixed, default: null },
  checksum: { type: String, required: true },
  notes: { type: String, default: '', maxlength: 500 },
  publishedBy: { type: ObjectId, ref: 'User', required: true },
  publishedAt: { type: Date, default: Date.now },
  rolledBackFrom: { type: Number, default: null },
}, { timestamps: false, minimize: false });
versionSchema.index({ workflowId: 1, version: -1 }, { unique: true });

// ------------------------------------------------------------------------------ Run
const stepSchema = new mongoose.Schema({
  nodeId: { type: String, required: true },
  type: { type: String, required: true },
  label: { type: String, default: '' },
  visit: { type: Number, default: 1 },
  attempt: { type: Number, default: 1 },
  status: { type: String, enum: STEP_STATUSES, required: true },
  port: { type: String, default: null },
  actionKey: { type: String, required: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  output: { type: Mixed, default: null },
  error: { code: String, message: String },
  manual: { type: String, default: null }, // retried | skipped (by a person)
}, { _id: true, minimize: false });

const runSchema = new mongoose.Schema({
  workflowId: { type: ObjectId, ref: 'Workflow', required: true },
  versionId: { type: ObjectId, ref: 'WorkflowVersion', required: true },
  version: { type: Number, required: true },
  leadId: { type: ObjectId, ref: 'Lead', required: true },
  campaignId: { type: ObjectId, ref: 'WorkflowCampaign', default: null },
  ownerId: { type: ObjectId, ref: 'User', required: true },
  status: { type: String, enum: RUN_STATUSES, default: 'queued' },
  // Unique per (workflow, lead, triggering occurrence) → duplicate events cannot double-enroll.
  enrollmentKey: { type: String, required: true },
  // Set while active (workflow:lead) unless reentry='always' → at most one active run per lead.
  activeKey: { type: String, default: undefined },
  trigger: {
    type: { type: String, default: null },
    eventId: { type: String, default: null },
    data: { type: Mixed, default: null },
  },
  currentNodeId: { type: String, default: null },
  wait: {
    kind: { type: String, default: null }, // timer | event | ai_call | analysis | callback | retry
    nodeId: { type: String, default: null },
    until: { type: Date, default: null },
    events: { type: [String], default: undefined },
    startedAt: { type: Date, default: null },
    data: { type: Mixed, default: null },
    resumeEvent: { type: Mixed, default: null },
  },
  nextRunAt: { type: Date, default: null },
  visits: { type: Mixed, default: () => ({}) },
  stepCount: { type: Number, default: 0 },
  context: { type: Mixed, default: () => ({}) },
  steps: { type: [stepSchema], default: [] },
  lockToken: { type: String, default: null },
  lockUntil: { type: Date, default: null },
  outcome: { type: String, enum: [...END_OUTCOMES, null], default: null },
  error: { code: { type: String, default: null }, message: { type: String, default: null }, nodeId: { type: String, default: null } },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  pausedBy: { type: String, default: null }, // user | campaign
}, { timestamps: true, minimize: false });
runSchema.index({ enrollmentKey: 1 }, { unique: true });
runSchema.index({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } });
runSchema.index({ status: 1, nextRunAt: 1 });
runSchema.index({ status: 1, lockUntil: 1 });
runSchema.index({ leadId: 1, status: 1 });
runSchema.index({ workflowId: 1, status: 1, updatedAt: -1 });
runSchema.index({ campaignId: 1, status: 1 });
runSchema.index({ 'wait.kind': 1, status: 1 });
runSchema.index({ updatedAt: -1 });

// ------------------------------------------------------------------------------ Event
const eventSchema = new mongoose.Schema({
  type: { type: String, required: true, maxlength: 80 },
  workflowId: { type: ObjectId, ref: 'Workflow', default: null },
  runId: { type: ObjectId, ref: 'WorkflowRun', default: null },
  campaignId: { type: ObjectId, ref: 'WorkflowCampaign', default: null },
  leadId: { type: ObjectId, ref: 'Lead', default: null },
  nodeId: { type: String, default: null },
  at: { type: Date, default: Date.now },
  actor: { type: ObjectId, ref: 'User', default: null },
  data: { type: Mixed, default: null },
  dedupeKey: { type: String, default: undefined, maxlength: 200 },
}, { timestamps: false, minimize: false });
eventSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
eventSchema.index({ runId: 1, at: 1 });
eventSchema.index({ leadId: 1, at: -1 });
eventSchema.index({ workflowId: 1, at: -1 });
eventSchema.index({ type: 1, at: -1 });
eventSchema.index({ at: -1 });

// ------------------------------------------------------------------------------ Campaign
const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 1000 },
  workflowId: { type: ObjectId, ref: 'Workflow', required: true, index: true },
  versionId: { type: ObjectId, ref: 'WorkflowVersion', default: null },
  version: { type: Number, default: null },
  status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },
  selection: {
    mode: { type: String, enum: ['explicit', 'filters'], default: 'explicit' },
    leadIds: { type: [ObjectId], default: [] },
    filters: {
      statuses: { type: [String], default: [] },
      tags: { type: [String], default: [] },
      sources: { type: [String], default: [] },
    },
  },
  counts: {
    selected: { type: Number, default: 0 },
    enrolled: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  skipped: { type: [{ leadId: ObjectId, reason: String, _id: false }], default: [] },
  startedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  stoppedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  createdBy: { type: ObjectId, ref: 'User', required: true, index: true },
  updatedBy: { type: ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

// ------------------------------------------------------------------------------ Link
const linkSchema = new mongoose.Schema({
  token: { type: String, required: true },
  // 'link' = tracked click redirect; 'open' = email open pixel (no destination).
  kind: { type: String, enum: ['link', 'open'], default: 'link' },
  url: { type: String, default: '', maxlength: 2000 },
  actionKey: { type: String, required: true },
  workflowId: { type: ObjectId, ref: 'Workflow', required: true },
  runId: { type: ObjectId, ref: 'WorkflowRun', required: true },
  leadId: { type: ObjectId, ref: 'Lead', required: true },
  nodeId: { type: String, required: true },
  clicks: { type: Number, default: 0 },
  humanClicks: { type: Number, default: 0 },
  scannerHits: { type: Number, default: 0 },
  firstClickAt: { type: Date, default: null },
  lastClickAt: { type: Date, default: null },
}, { timestamps: true });
linkSchema.index({ token: 1 }, { unique: true });
linkSchema.index({ actionKey: 1 }, { unique: true });
linkSchema.index({ workflowId: 1, createdAt: -1 });

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
export const Workflow = model('Workflow', workflowSchema);
export const WorkflowVersion = model('WorkflowVersion', versionSchema);
export const WorkflowRun = model('WorkflowRun', runSchema);
export const WorkflowEvent = model('WorkflowEvent', eventSchema);
export const WorkflowCampaign = model('WorkflowCampaign', campaignSchema);
export const WorkflowLink = model('WorkflowLink', linkSchema);
