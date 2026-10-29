import mongoose from 'mongoose';

/**
 * Team — a group of users used for team-scoped lead access
 * (LEAD_ACCESS_MODE=team) and supervisor escalation.
 *
 * Member roles:
 *   member      — their own leads only (+ the team's unassigned pool, if shared)
 *   supervisor  — also sees leads assigned to every member of this team
 *   manager     — supervisor rights + may edit this team's membership
 *
 * `leadScope` is optional: `shareUnassigned` lets members see unassigned leads
 * (a shared pool), optionally limited to the listed lead `sources`.
 */
export const TEAM_MEMBER_ROLES = Object.freeze(['member', 'supervisor', 'manager']);
export const SUPERVISING_ROLES = Object.freeze(['supervisor', 'manager']);

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: TEAM_MEMBER_ROLES, default: 'member' },
  addedAt: { type: Date, default: Date.now },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  members: { type: [memberSchema], default: [] },
  leadScope: {
    shareUnassigned: { type: Boolean, default: false },
    sources: { type: [String], default: [] },
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

teamSchema.index({ 'members.userId': 1, isActive: 1 });
teamSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const Team = mongoose.models.Team || mongoose.model('Team', teamSchema);
export default Team;
