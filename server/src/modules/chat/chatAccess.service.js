import mongoose from 'mongoose';
import ChatRoom from './chatRoom.model.js';
import Project from '../pm/project.model.js';
import ScheduleEntry from '../pm/scheduleEntry.model.js';
import Order from '../qop/order.model.js';
import Assignment from '../deploy/assignment.model.js';
import Task from '../tasks/task.model.js';
import User from '../auth/user.model.js';
import Lead from '../crm/lead.model.js';
import { loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

function idOf(value) {
  if (!value) return null;
  return String(value._id ?? value);
}

function addId(set, value) {
  const id = idOf(value);
  if (id && mongoose.isValidObjectId(id)) set.add(id);
}

function uniqueIds(values) {
  return [...new Set((values || []).map(idOf).filter((id) => id && mongoose.isValidObjectId(id)))];
}

function isAdmin(user) {
  return user?.role?.name === 'Admin';
}

async function findUsersForTarget(targetId) {
  return findUsersForTargets([targetId]);
}

/** Active users of any of the targets (department name/id or preferred department id) in one query. */
async function findUsersForTargets(targetIds) {
  const targets = [...new Set((targetIds || []).filter(Boolean).map(String))];
  if (!targets.length) return [];
  const objectIds = targets.filter((target) => mongoose.isValidObjectId(target));
  const clauses = [{ department: { $in: targets } }];
  if (objectIds.length) clauses.push({ 'preferences.preferredDepartmentId': { $in: objectIds } });

  const users = await User.find({
    isDeleted: false,
    status: 'active',
    $or: clauses,
  }).select('_id').lean();

  return users.map((user) => String(user._id));
}

async function collectAssignments(assignments, set) {
  const targets = [];
  for (const assignment of assignments || []) {
    addId(set, assignment.employeeId);
    addId(set, assignment.createdBy);
    addId(set, assignment.updatedBy);

    if (assignment.assignmentTargetType === 'EMPLOYEE') {
      addId(set, assignment.assignmentTargetId);
    } else if (assignment.assignmentTargetId) {
      targets.push(assignment.assignmentTargetId);
    }
  }
  // One query for all team/department targets instead of one per assignment.
  const targetUsers = await findUsersForTargets(targets);
  targetUsers.forEach((id) => addId(set, id));
}

const chatAccessService = {
  isAdmin,

  async canReadLeads(user) {
    if (isAdmin(user)) return true;
    return satisfiesPermission(await loadUserPermissions(user), 'lead:read');
  },

  async assertLeadAccess(leadIds, user) {
    if (!await this.canReadLeads(user)) throw new AuthorizationError('Lead access is required for this conversation');
    const ids = uniqueIds(leadIds);
    if (ids.length !== (leadIds || []).length) throw new ValidationError('Select valid, unique leads');
    const count = await Lead.countDocuments({ _id: { $in: ids }, isDeleted: { $ne: true } });
    if (count !== ids.length) throw new NotFoundError('One or more selected leads');
    return ids;
  },

  async assertLeadMembersAllowed(memberIds) {
    const ids = uniqueIds(memberIds);
    const users = await User.find({ _id: { $in: ids }, isDeleted: false, status: 'active' }).populate('role', 'name').lean();
    if (users.length !== ids.length) throw new ValidationError('Select active team members');
    const allowed = await Promise.all(users.map(async user => {
      if (isAdmin(user)) return true;
      const permissions = await loadUserPermissions(user);
      return satisfiesPermission(permissions, 'chat:read') && satisfiesPermission(permissions, 'lead:read');
    }));
    if (allowed.some(value => !value)) throw new ValidationError('Every participant needs chat and lead access');
    return ids;
  },

  async resolveProjectParticipantIds(projectId) {
    if (!mongoose.isValidObjectId(projectId)) throw new NotFoundError('Project', projectId);

    const project = await Project.findById(projectId)
      .select('projectManagerId teamId createdBy updatedBy')
      .lean();
    if (!project) throw new NotFoundError('Project', projectId);

    const participantIds = new Set();
    addId(participantIds, project.projectManagerId);
    addId(participantIds, project.createdBy);
    addId(participantIds, project.updatedBy);

    const projectTeamUsers = await findUsersForTarget(project.teamId);
    projectTeamUsers.forEach((id) => addId(participantIds, id));

    const [assignments, tasks, scheduleEntries, orders] = await Promise.all([
      Assignment.find({ projectId, status: { $ne: 'CANCELLED' } })
        .select('employeeId assignmentTargetType assignmentTargetId createdBy updatedBy')
        .lean(),
      Task.find({ projectId })
        .select('assigneeId createdBy updatedBy completedBy')
        .lean(),
      ScheduleEntry.find({ projectId, status: { $ne: 'CANCELLED' } })
        .select('responsibleTeamId createdBy updatedBy')
        .lean(),
      Order.find({ projectId })
        .select('assignedTeam createdBy updatedBy')
        .lean(),
    ]);

    await collectAssignments(assignments, participantIds);

    tasks.forEach((task) => {
      addId(participantIds, task.assigneeId);
      addId(participantIds, task.createdBy);
      addId(participantIds, task.updatedBy);
      addId(participantIds, task.completedBy);
    });

    scheduleEntries.forEach((entry) => {
      addId(participantIds, entry.responsibleTeamId);
      addId(participantIds, entry.createdBy);
      addId(participantIds, entry.updatedBy);
    });

    orders.forEach((order) => {
      (order.assignedTeam || []).forEach((id) => addId(participantIds, id));
      addId(participantIds, order.createdBy);
      addId(participantIds, order.updatedBy);
    });

    return [...participantIds];
  },

  async resolveOrderParticipantIds(orderId) {
    if (!mongoose.isValidObjectId(orderId)) throw new NotFoundError('Order', orderId);

    const order = await Order.findById(orderId)
      .select('projectId assignedTeam createdBy updatedBy')
      .lean();
    if (!order) throw new NotFoundError('Order', orderId);

    const participantIds = new Set();
    (order.assignedTeam || []).forEach((id) => addId(participantIds, id));
    addId(participantIds, order.createdBy);
    addId(participantIds, order.updatedBy);

    if (order.projectId) {
      const projectIds = await this.resolveProjectParticipantIds(order.projectId);
      projectIds.forEach((id) => addId(participantIds, id));
    }

    const [assignments, tasks] = await Promise.all([
      Assignment.find({ orderId, status: { $ne: 'CANCELLED' } })
        .select('employeeId assignmentTargetType assignmentTargetId createdBy updatedBy')
        .lean(),
      Task.find({ orderId })
        .select('assigneeId createdBy updatedBy completedBy')
        .lean(),
    ]);

    await collectAssignments(assignments, participantIds);
    tasks.forEach((task) => {
      addId(participantIds, task.assigneeId);
      addId(participantIds, task.createdBy);
      addId(participantIds, task.updatedBy);
      addId(participantIds, task.completedBy);
    });

    return [...participantIds];
  },

  async resolveContextParticipantIds({ projectId, orderId } = {}) {
    const participantIds = new Set();

    if (projectId) {
      const ids = await this.resolveProjectParticipantIds(projectId);
      ids.forEach((id) => addId(participantIds, id));
    }

    if (orderId) {
      const ids = await this.resolveOrderParticipantIds(orderId);
      ids.forEach((id) => addId(participantIds, id));
    }

    return [...participantIds];
  },

  async assertContextAccess({ projectId, orderId } = {}, user) {
    const participantIds = await this.resolveContextParticipantIds({ projectId, orderId });
    if (!projectId && !orderId) return participantIds;
    if (isAdmin(user)) return participantIds;

    const userId = idOf(user);
    if (!participantIds.includes(userId)) {
      throw new AuthorizationError('Only project or order team members can access this chat');
    }

    return participantIds;
  },

  async assertLinkedRoomAccess(room, user) {
    if (room?.roomType === 'LEAD' || room?.leadIds?.length) await this.assertLeadAccess((room.leadIds || []).map(idOf), user);
    if (!room?.projectId && !room?.orderId) return [];
    return this.assertContextAccess({ projectId: idOf(room.projectId), orderId: idOf(room.orderId) }, user);
  },

  async hydrateRoomMembers(roomId, memberIds) {
    const ids = uniqueIds(memberIds);
    if (!ids.length) return;
    // One database round trip; each conditional push remains atomic so concurrent
    // resolvers cannot duplicate members or overwrite their original joinedAt.
    await ChatRoom.bulkWrite(ids.map(userId => ({
      updateOne: {
        filter: { _id: roomId, 'members.userId': { $ne: userId } },
        update: { $push: { members: { userId, joinedAt: new Date() } } },
      },
    })), { ordered: false });
  },

  async assertRequestedMembersAllowed(context, memberIds = [], user) {
    const participantIds = await this.assertContextAccess(context, user);
    if (!context?.projectId && !context?.orderId) return uniqueIds(memberIds);

    const requested = uniqueIds(memberIds);
    const unauthorized = requested.filter((id) => !participantIds.includes(id));
    if (unauthorized.length > 0) {
      throw new ValidationError('Linked chats can only include project or order team members', [
        { field: 'memberIds', message: 'One or more selected members are not assigned to this project/order' },
      ]);
    }

    return requested;
  },

  async listProjectMembers(projectId, user) {
    const ids = await this.assertContextAccess({ projectId }, user);
    if (ids.length === 0) return [];

    return User.find({ _id: { $in: ids }, isDeleted: false })
      .select('firstName lastName email avatarFileId role department position')
      .populate('role', 'name')
      .sort({ firstName: 1, lastName: 1 })
      .lean();
  },
};

export default chatAccessService;
