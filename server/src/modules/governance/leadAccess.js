import mongoose from 'mongoose';
import teamService from './team.service.js';
import { loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';
import { getGovernanceSettings } from '../../shared/security/governanceSettings.js';

/**
 * Lead access policy — THE single place that decides which leads a user may see.
 *
 * LEAD_ACCESS_MODE=company (default): unrestricted (today's behaviour).
 * LEAD_ACCESS_MODE=team: a user sees leads they
 *   - created,
 *   - are assigned to,
 *   - that are assigned to members of teams they supervise/manage,
 *   - or that sit unassigned in a pool their team shares (team.leadScope);
 * users holding `lead:read:all` (Admin always does) see every lead.
 *
 * "Own" (no break-glass reason needed) = created by or assigned to the user.
 */
export const LEAD_READ_ALL_PERMISSION = 'lead:read:all';

const oid = (value) => new mongoose.Types.ObjectId(String(value));
const idOf = (value) => (value === null || value === undefined ? null : String(value?._id ?? value));

/** Admin-or-permission check usable outside the requirePermission middleware. */
export async function userHasPermission(user, permission) {
  if (!user) return false;
  if (user.role?.name === 'Admin') return true;
  const permissions = await loadUserPermissions(user);
  return satisfiesPermission(permissions || [], permission);
}

/**
 * Resolve the caller's lead scope:
 *   { mode, unrestricted, userId, supervisedUserIds, pools, filter }
 * `filter` is a Mongo filter ({} when unrestricted) built from real ObjectIds, so
 * it is valid in find() and in aggregation $match alike.
 */
export async function resolveLeadScope(user, settings = getGovernanceSettings()) {
  const userId = idOf(user?._id);
  if (!settings.teamMode) {
    return { mode: 'company', unrestricted: true, userId, supervisedUserIds: [], pools: [], filter: {} };
  }
  if (!userId) {
    // Defensive: a governed request without a user sees nothing.
    return { mode: 'team', unrestricted: false, userId: null, supervisedUserIds: [], pools: [], filter: { _id: { $exists: false } } };
  }
  if (await userHasPermission(user, LEAD_READ_ALL_PERMISSION)) {
    return { mode: 'team', unrestricted: true, userId, supervisedUserIds: [], pools: [], filter: {} };
  }
  const { supervisedUserIds, pools } = await teamService.getScopeFor(userId);
  const me = oid(userId);
  const or = [
    { createdBy: me },
    { assignedTo: { $in: [me, ...supervisedUserIds.map(oid)] } },
  ];
  for (const pool of pools) {
    or.push(pool.sources?.length
      ? { assignedTo: null, source: { $in: pool.sources } }
      : { assignedTo: null });
  }
  return { mode: 'team', unrestricted: false, userId, supervisedUserIds, pools, filter: { $or: or } };
}

/** The reusable lead-access Mongo filter for `user` ({} = no restriction). */
export async function buildLeadAccessFilter(user) {
  return (await resolveLeadScope(user)).filter;
}

/**
 * Visibility of one lead ({ createdBy, assignedTo, source }) under a resolved scope.
 * Returns { visible, own }.
 */
export function evaluateLeadVisibility(scope, lead) {
  if (!lead) return { visible: false, own: false };
  const createdBy = idOf(lead.createdBy);
  const assignedTo = idOf(lead.assignedTo);
  const own = Boolean(scope.userId) && (createdBy === scope.userId || assignedTo === scope.userId);
  if (scope.unrestricted || own) return { visible: true, own };
  if (assignedTo && scope.supervisedUserIds.includes(assignedTo)) return { visible: true, own: false };
  if (!assignedTo) {
    const pooled = scope.pools.some((pool) => !pool.sources?.length || pool.sources.includes(lead.source));
    if (pooled) return { visible: true, own: false };
  }
  return { visible: false, own: false };
}

/** Load the ownership fields of the given leads (live only): Map<id, lead>. */
export async function loadLeadOwnership(leadIds = []) {
  const ids = [...new Set(leadIds.map(String))].filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return new Map();
  const Lead = (await import('../crm/lead.model.js')).default;
  const rows = await Lead.find({ _id: { $in: ids } }).select('_id createdBy assignedTo source').lean();
  return new Map(rows.map((row) => [String(row._id), row]));
}

/** Of `leadIds`, the ones the scope may NOT see (existing leads only). */
export async function findInaccessibleLeadIds(scope, leadIds = []) {
  if (scope.unrestricted) return [];
  const leads = await loadLeadOwnership(leadIds);
  return [...leads.values()]
    .filter((lead) => !evaluateLeadVisibility(scope, lead).visible)
    .map((lead) => String(lead._id));
}

export default {
  LEAD_READ_ALL_PERMISSION,
  userHasPermission,
  resolveLeadScope,
  buildLeadAccessFilter,
  evaluateLeadVisibility,
  loadLeadOwnership,
  findInaccessibleLeadIds,
};
