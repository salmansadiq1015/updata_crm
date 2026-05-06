import User from './user.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

/**
 * User repository — pure data access.
 */

const ALLOWED_FILTERS = {
  role: 'objectId',
  status: 'exact',
  language: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'firstName', 'lastName', 'email', '_id'];

class UserRepository {
  async create(data) {
    const user = new User(data);
    return user.save();
  }

  async findById(id, options = {}) {
    let query = User.findById(id);

    if (options.includeSecrets) {
      query = query.select(
        '+passwordHash +passwordChangedAt +failedLoginAttempts +lockedUntil ' +
        '+activationTokenHash +activationTokenExpires +resetTokenHash +resetTokenExpires',
      );
    }

    if (options.populateRole !== false) {
      query = query.populate('permissions' in (options.populateRole || {})
        ? { path: 'role', populate: { path: 'permissions' } }
        : { path: 'role', select: 'name permissions isSystem' });
    }

    return query.lean();
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
      query = query.populate('role', 'name permissions isSystem');
    }

    return query.lean();
  }

  /**
   * Cursor-paginated list with search and filters.
   */
  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    // Text search
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await User.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate('role', 'name')
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
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

  async countByRole(roleId) {
    return User.countDocuments({ role: roleId, isDeleted: false });
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
      { $set: { isDeleted: true, deletedAt: new Date(), status: 'deactivated' } },
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
