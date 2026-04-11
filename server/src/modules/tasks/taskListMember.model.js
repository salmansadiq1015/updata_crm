import mongoose from 'mongoose';

export const MEMBER_ROLES = ['VIEWER', 'EDITOR', 'ADMIN'];

const taskListMemberSchema = new mongoose.Schema(
  {
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaskList', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: MEMBER_ROLES, required: true, default: 'EDITOR' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

taskListMemberSchema.index({ listId: 1, userId: 1 }, { unique: true });
taskListMemberSchema.index({ userId: 1 });

const TaskListMember = mongoose.model('TaskListMember', taskListMemberSchema);
export default TaskListMember;
