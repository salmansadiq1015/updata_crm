import mongoose from 'mongoose';
import Team, { SUPERVISING_ROLES } from './team.model.js';
import User from '../auth/user.model.js';
import auditService from '../auth/audit.service.js';
import { AppError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

/**
 * Team service — membership administration + the read helpers other modules use:
 *
 *   getSupervisorsFor(userId) → string[]  supervisors/managers of every active team
 *                                          the user is a plain member of (escalation)
 *   getMembers(teamId)        → [{ userId, role }]
 *   getScopeFor(userId)       → { supervisedUserIds, pools } used by leadAccess.js
 */
const USER_SELECT = 'firstName lastName email status';
const toId = (value) => String(value?._id ?? value);
const oid = (value) => new mongoose.Types.ObjectId(String(value));

function serialize(team) {
  if (!team) return team;
  return {
    id: String(team._id),
    name: team.name,
    description: team.description || '',
    isActive: team.isActive !== false,
    leadScope: {
      shareUnassigned: Boolean(team.leadScope?.shareUnassigned),
      sources: team.leadScope?.sources || [],
    },
    members: (team.members || []).map((m) => ({
      userId: toId(m.userId),
      role: m.role,
      addedAt: m.addedAt || null,
      user: m.userId && typeof m.userId === 'object' && m.userId.email !== undefined
        ? {
          id: toId(m.userId),
          firstName: m.userId.firstName || '',
          lastName: m.userId.lastName || '',
          email: m.userId.email || '',
          status: m.userId.status || null,
        }
        : null,
    })),
    createdAt: team.createdAt || null,
    updatedAt: team.updatedAt || null,
  };
}

function dedupeMembers(members = [], actorId) {
  const byUser = new Map();
  for (const m of members) {
    const id = String(m.userId);
    byUser.set(id, { userId: oid(id), role: m.role || 'member', addedBy: actorId ? oid(actorId) : null });
  }
  return [...byUser.values()];
}

async function assertUsersExist(members) {
  const ids = [...new Set(members.map((m) => String(m.userId)))];
  if (!ids.length) return;
  const found = await User.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) {
    throw new AppError('One or more team members do not exist', 400, ERROR_CODES.INVALID_INPUT, [
      { field: 'members', message: 'Unknown user id in members' },
    ]);
  }
}

class TeamService {
  async list({ includeInactive = false } = {}) {
    const filter = includeInactive ? {} : { isActive: true };
    const teams = await Team.find(filter).sort({ name: 1 })
      .populate({ path: 'members.userId', select: USER_SELECT, options: { includeDeleted: true } })
      .lean();
    return teams.map(serialize);
  }

  async get(id) {
    const team = await Team.findById(id)
      .populate({ path: 'members.userId', select: USER_SELECT, options: { includeDeleted: true } })
      .lean();
    if (!team) throw new NotFoundError('Team', id);
    return serialize(team);
  }

  async create(data, actorId, meta = {}) {
    const members = dedupeMembers(data.members, actorId);
    await assertUsersExist(members);
    let team;
    try {
      team = await Team.create({
        name: data.name,
        description: data.description || '',
        members,
        leadScope: data.leadScope || {},
        createdBy: actorId,
      });
    } catch (err) {
      if (err?.code === 11000) throw new ConflictError('A team with this name already exists');
      throw err;
    }
    this._audit('team.created', actorId, meta, { teamId: String(team._id), name: team.name, members: members.length });
    return this.get(team._id);
  }

  async update(id, data, actorId, meta = {}) {
    const team = await Team.findById(id);
    if (!team) throw new NotFoundError('Team', id);
    const before = team.members.map((m) => ({ userId: String(m.userId), role: m.role }));
    if (data.name !== undefined) team.name = data.name;
    if (data.description !== undefined) team.description = data.description;
    if (data.isActive !== undefined) team.isActive = data.isActive;
    if (data.leadScope !== undefined) team.leadScope = { ...team.leadScope?.toObject?.(), ...data.leadScope };
    if (data.members !== undefined) {
      const members = dedupeMembers(data.members, actorId);
      await assertUsersExist(members);
      const previous = new Map(team.members.map((m) => [String(m.userId), m]));
      team.members = members.map((m) => ({
        ...m,
        addedAt: previous.get(String(m.userId))?.addedAt || new Date(),
        addedBy: previous.get(String(m.userId))?.addedBy || m.addedBy,
      }));
    }
    team.updatedBy = actorId;
    try {
      await team.save();
    } catch (err) {
      if (err?.code === 11000) throw new ConflictError('A team with this name already exists');
      throw err;
    }
    this._audit('team.updated', actorId, meta, {
      teamId: String(team._id),
      changedFields: Object.keys(data),
      membersBefore: before,
      membersAfter: team.members.map((m) => ({ userId: String(m.userId), role: m.role })),
    });
    return this.get(team._id);
  }

  async remove(id, actorId, meta = {}) {
    const team = await Team.findByIdAndDelete(id).lean();
    if (!team) throw new NotFoundError('Team', id);
    this._audit('team.deleted', actorId, meta, { teamId: String(id), name: team.name });
    return { id: String(id), deleted: true };
  }

  /** True when `userId` is a manager of `teamId` (may edit that team's membership). */
  async isManagerOf(teamId, userId) {
    return Boolean(await Team.exists({
      _id: teamId, isActive: true, members: { $elemMatch: { userId: oid(userId), role: 'manager' } },
    }));
  }

  /** Members of a team: [{ userId, role }]. */
  async getMembers(teamId) {
    const team = await Team.findById(teamId).select('members').lean();
    if (!team) return [];
    return team.members.map((m) => ({ userId: String(m.userId), role: m.role }));
  }

  /**
   * Supervisors/managers responsible for `userId`: those of every active team in
   * which the user is a member. Supervisors first, then managers; never the user.
   */
  async getSupervisorsFor(userId) {
    const me = String(userId);
    const teams = await Team.find({ isActive: true, 'members.userId': oid(me) }).select('members').lean();
    const supervisors = [];
    const managers = [];
    for (const team of teams) {
      for (const m of team.members) {
        const id = String(m.userId);
        if (id === me) continue;
        if (m.role === 'supervisor' && !supervisors.includes(id)) supervisors.push(id);
        if (m.role === 'manager' && !managers.includes(id)) managers.push(id);
      }
    }
    return [...supervisors, ...managers.filter((id) => !supervisors.includes(id))];
  }

  /**
   * The team-derived part of a user's lead scope, from ONE query:
   *  - supervisedUserIds: every member of teams the user supervises/manages
   *  - pools: unassigned-lead pools shared with the user's teams
   *  - teamIds: teams the user belongs to
   */
  async getScopeFor(userId) {
    const me = String(userId);
    const teams = await Team.find({ isActive: true, 'members.userId': oid(me) })
      .select('_id members leadScope').lean();
    const supervised = new Set();
    const pools = [];
    for (const team of teams) {
      const mine = team.members.find((m) => String(m.userId) === me);
      if (mine && SUPERVISING_ROLES.includes(mine.role)) {
        for (const m of team.members) supervised.add(String(m.userId));
      }
      if (team.leadScope?.shareUnassigned) {
        pools.push({ teamId: String(team._id), sources: team.leadScope.sources || [] });
      }
    }
    supervised.delete(me);
    return { supervisedUserIds: [...supervised], pools, teamIds: teams.map((t) => String(t._id)) };
  }

  _audit(eventType, userId, meta, details) {
    auditService.logEvent({
      eventType,
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details,
      module: 'governance',
    });
  }
}

const teamService = new TeamService();
export default teamService;
