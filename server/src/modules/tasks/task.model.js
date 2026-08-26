import mongoose from 'mongoose';

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
export const TASK_PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export const MAX_SUBTASK_DEPTH = 3;

// Where a task originates from (Herkunft) — drives the origin icon/label in the
// department task board. Kept separate from projectId/orderId (which still link
// the records) so any origin can be represented uniformly.
export const TASK_SOURCE_TYPES = [
  'MANUAL', 'PROJECT', 'ORDER', 'SITE', 'MAINTENANCE', 'QUOTATION',
  'CUSTOMER_INQUIRY', 'DISPOSITION', 'INVOICE', 'DOCUMENT', 'MEETING',
  // Proposed by an agent rather than put there by a person. It is ordinary
  // work in every other respect; what it is not is a commitment somebody made,
  // which is why closing a project does not wait on it.
  'AI_AGENT',
];

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 500 },
    description: { type: String, default: null },
    status: { type: String, enum: TASK_STATUSES, default: 'OPEN' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'NONE' },
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaskList', required: true },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assigneeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    parentTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', default: null },
    // Object (Objekt/Site) the task belongs to. Lets an object list every task
    // that concerns it, grouped by department. Independent of projectId: a task
    // can hang off the object directly or reach it through one of its projects.
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    // Department (Abteilung/Sparte) the task belongs to — the task board groups by it.
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    // Origin (Herkunft) for display: type + optional linked record + human label.
    source: {
      type: { type: String, enum: TASK_SOURCE_TYPES, default: 'MANUAL' },
      refId: { type: mongoose.Schema.Types.ObjectId, default: null },
      label: { type: String, trim: true, maxlength: 255, default: null },
    },
    // Own chat room for the task (null when it uses the linked project's chat).
    chatRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', default: null },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
    depth: { type: Number, default: 0, min: 0, max: MAX_SUBTASK_DEPTH },
    version: { type: Number, default: 0, min: 0 },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    // Lock (Sperrfunktion): confidential/personal task that stays with its owner.
    // Locked tasks cannot be reassigned/claimed, never enter the overdue pool,
    // and are invisible to everyone except the owner (assignee/creator/lockedBy) and admins.
    locked: { type: Boolean, default: false },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lockedAt: { type: Date, default: null },
    // Overdue pool (Aufgabenpool): a task overdue past the configured working-day
    // threshold is flagged into a shared pool so colleagues can help. The task
    // stays with its assignee; poolHelperId records who stepped in to support.
    inPool: { type: Boolean, default: false },
    pooledAt: { type: Date, default: null },
    poolHelperId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// Indexes
taskSchema.index({ listId: 1, isDeleted: 1 });
taskSchema.index({ assigneeId: 1, isDeleted: 1 });
taskSchema.index({ assigneeIds: 1, isDeleted: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ priority: 1 });
taskSchema.index({ startDate: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ projectId: 1 }, { sparse: true });
taskSchema.index({ orderId: 1 }, { sparse: true });
taskSchema.index({ meetingId: 1 }, { sparse: true });
taskSchema.index({ siteId: 1, status: 1, isDeleted: 1 }, { sparse: true });
taskSchema.index({ parentTaskId: 1 }, { sparse: true });
taskSchema.index({ updatedAt: 1 }); // For sync queries
taskSchema.index({ listId: 1, status: 1, sortOrder: 1, isDeleted: 1 });
taskSchema.index({ assigneeId: 1, status: 1, dueDate: 1, isDeleted: 1 });
taskSchema.index({ projectId: 1, status: 1, sortOrder: 1 }, { sparse: true });
taskSchema.index({ createdBy: 1, isDeleted: 1 });
taskSchema.index({ inPool: 1, isDeleted: 1 });

// Validation: projectId and orderId are mutually exclusive
taskSchema.pre('validate', function () {
  if (this.projectId && this.orderId) {
    throw new Error('Task cannot be linked to both a project and an order');
  }
});

// Soft delete filter
taskSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Task = mongoose.model('Task', taskSchema);
export default Task;
