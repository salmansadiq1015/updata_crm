import User from './user.model.js';
import { buildUserSearchFilter } from './userSearch.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';
import { decodeCursor } from '../../shared/utils/pagination.js';
import mongoose from 'mongoose';

/**
 * User repository — pure data access.
 */

const ALLOWED_FILTERS = {
  role: 'objectId',
  status: 'exact',
  language: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'firstName', 'lastName', 'email', 'department', 'position', 'status', 'lastLoginAt', '_id'];
// Sort fields that may be null/missing. MongoDB sorts null lowest, and `$lt`/`$gt` never
// match null, so the generic cursor would drop (desc) or stop at (asc) those users.
const NULLABLE_SORT_FIELDS = new Set(['department', 'position', 'lastLoginAt']);
const DATE_SORT_FIELDS = new Set(['createdAt', 'lastLoginAt']);
const USER_STATUSES = ['active', 'pending_activation', 'deactivated', 'locked'];

/** Keyset condition for "after this cursor" that is correct for null sort values. */
function nullSafeCursorQuery(cursor, sortBy, sortOrder) {
  const decoded = decodeCursor(cursor);
  if (!decoded || !/^[a-f0-9]{24}$/i.test(String(decoded._id || ''))) return {};
  const id = new mongoose.Types.ObjectId(decoded._id);
  const desc = sortOrder === 'desc', op = desc ? '$lt' : '$gt';
  const raw = decoded[sortBy];
  if (raw === undefined || raw === null) {
    // Cursor sits in the null group: desc → rest of the null group; asc → rest of it, then all non-null.
    return desc
      ? { [sortBy]: null, _id: { $lt: id } }
      : { $or: [{ [sortBy]: null, _id: { $gt: id } }, { [sortBy]: { $ne: null } }] };
  }
  const value = DATE_SORT_FIELDS.has(sortBy) ? new Date(raw) : raw;
  return {
    $or: [
      { [sortBy]: { [op]: value } },
      { [sortBy]: value, _id: { [op]: id } },
      ...(desc ? [{ [sortBy]: null }] : []),
    ],
  };
}

class UserRepository {
  async create(data) {
    const user = new User(data);
    return user.save();
  }

  async findById(id, options = {}) {
    let query = User.findById(id);

    if (options.includeDeleted) {
      query = query.setOptions({ includeDeleted: true });
    }

    if (options.includeSecrets) {
      query = query.select(
        '+passwordHash +passwordChangedAt +failedLoginAttempts +lockedUntil ' +
        '+activationTokenHash +activationTokenExpires +resetTokenHash +resetTokenExpires',
      );
    }

    if (options.populateRole !== false) {
      query = query.populate('permissions' in (options.populateRole || {})
        ? { path: 'role', populate: { path: 'permissions' } }
        : { path: 'role', select: 'name permissions isSystem uiConfig' });
    }

    if (!options.includeSecrets) query = query.select('+activationTokenHash');
    const user = await query.lean();
    if (!user || options.includeSecrets) return user;
    const { activationTokenHash, ...safeUser } = user;
    return { ...safeUser, invitationPending: Boolean(activationTokenHash) };
  }

  async findByEmail(email, options = {}) {
    if (!email) return null;
    let query = User.findOne({ email: email.toLowerCase() });

    if (options.includeSecrets) {
      query = query.select(
        '+passwordHash +passwordChangedAt +failedLoginAttempts +lockedUntil ' +
        '+activationTokenHash +activationTokenExpires +resetTokenHash +resetTokenExpires',
      );
    }

    if (options.populateRole !== false) {
      query = query.populate('permissions' in (options.populateRole || {})
        ? { path: 'role', populate: { path: 'permissions' } }
        : { path: 'role', select: 'name permissions isSystem uiConfig' });
    }

    return query.lean();
  }

  /**
   * Cursor-paginated list with search and filters.
   */
  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const resolvedSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...(NULLABLE_SORT_FIELDS.has(resolvedSortBy)
        ? (cursor ? nullSafeCursorQuery(cursor, resolvedSortBy, sortOrder) : {})
        : buildCursorQuery(cursor, resolvedSortBy, sortOrder)),
    };

    // Keep cursor $or and search conditions independent; neither may replace the other.
    Object.assign(filter, buildUserSearchFilter(search));

    const sort = buildCursorSort(resolvedSortBy, sortOrder);

    const docs = await User.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate('role', 'name')
      .select('-__v').select('+activationTokenHash')
      .lean();

    const safeDocs = docs.map(({ activationTokenHash, ...user }) => ({ ...user, invitationPending: Boolean(activationTokenHash) }));
    const response = buildCursorResponse(safeDocs, limit, resolvedSortBy);
    // encodeCursor omits undefined fields; keep a null marker so the next page stays in order.
    if (response.pagination.nextCursor && NULLABLE_SORT_FIELDS.has(resolvedSortBy)) {
      const last = response.data[response.data.length - 1];
      const value = last[resolvedSortBy] ?? null;
      response.pagination.nextCursor = Buffer.from(JSON.stringify({
        _id: String(last._id),
        [resolvedSortBy]: value instanceof Date ? value.toISOString() : value,
      })).toString('base64url');
    }
    return response;
  }

  /**
   * Ids of users whose first/last name or email matches `search` — used to let a
   * lead search match by assignee / creator name. Soft-deleted users are excluded
   * by the model's find hook; `search` is regex-escaped so it is a literal term.
   */
  async findIdsByNameOrEmail(search, limit = 50) {
    const term = typeof search === 'string' ? search.trim() : '';
    if (!term) return [];
    const docs = await User.find(
      buildUserSearchFilter(term),
      { _id: 1 },
    ).limit(Math.max(1, Math.min(Number(limit) || 50, 200))).lean();
    return docs.map((doc) => doc._id);
  }

  async updateById(id, data) {
    return User.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    })
      .populate('role', 'name')
      .lean();
  }

  async softDelete(id) {
    return User.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), status: 'deactivated' },
      { returnDocument: 'after' },
    );
  }

  async deactivate(id) {
    return User.findByIdAndUpdate(
      id,
      { status: 'deactivated', isDeleted: false, deletedAt: null },
      { returnDocument: 'after', runValidators: true },
    )
      .populate('role', 'name')
      .lean();
  }

  async activate(id) {
    return User.findByIdAndUpdate(
      id,
      {
        status: 'active',
        isDeleted: false,
        deletedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      {
        returnDocument: 'after',
        runValidators: true,
      },
    )
      .setOptions({ includeDeleted: true })
      .populate('role', 'name')
      .lean();
  }

  async countByRole(roleId) {
    return User.countDocuments({ role: roleId, isDeleted: false });
  }

  /**
   * Count non-deleted users grouped by role.
   * Returns a map { roleId: count } for the roles list "Benutzer" column.
   */
  async countGroupedByRole() {
    const rows = await User.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);
    return rows.reduce((acc, row) => {
      if (row._id) acc[String(row._id)] = row.count;
      return acc;
    }, {});
  }

  /**
   * Count active users with admin role.
   * Used for "last admin" protection.
   */
  async countActiveAdmins(adminRoleId) {
    return User.countDocuments({
      role: adminRoleId,
      status: 'active',
      isDeleted: false,
    });
  }

  /**
   * One $group over non-deleted users: totals per status plus users created since
   * `since`. Served from the {isDeleted, status, createdAt} index (covered).
   */
  async statusCounts(since) {
    const rows = await User.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 }, recent: { $sum: { $cond: [{ $gte: ['$createdAt', since] }, 1, 0] } } } },
    ]);
    const byStatus = Object.fromEntries(USER_STATUSES.map((status) => [status, 0]));
    let total = 0, newThisMonth = 0;
    for (const row of rows) {
      total += row.count; newThisMonth += row.recent;
      if (row._id in byStatus) byStatus[row._id] += row.count;
    }
    return { total, byStatus, newThisMonth };
  }

  async countAll() {
    return User.countDocuments({ isDeleted: false });
  }

  /**
   * Bulk update: apply the same update to multiple user IDs.
   * Returns the count of modified documents.
   */
  async bulkUpdate(ids, data) {
    const result = await User.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: data },
      { runValidators: true },
    );
    return result.modifiedCount;
  }

  /**
   * Bulk soft-delete: deactivate multiple users at once.
   * Returns the count of modified documents.
   */
  async bulkSoftDelete(ids) {
    const result = await User.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), status: 'deactivated', isOnline: false, activationTokenHash: null, activationTokenExpires: null, resetTokenHash: null, resetTokenExpires: null } },
    );
    return result.modifiedCount;
  }

  async bulkDeactivate(ids) {
    const result = await User.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: { status: 'deactivated', isDeleted: false, deletedAt: null } },
      { runValidators: true },
    );
    return result.modifiedCount;
  }

  /**
   * Find multiple users by IDs (for bulk validation).
   */
  async findByIds(ids) {
    return User.find({ _id: { $in: ids }, isDeleted: false })
      .populate('role', 'name')
      .lean();
  }
}

const userRepository = new UserRepository();
export default userRepository;
