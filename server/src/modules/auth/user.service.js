import userRepository from './user.repository.js';
import roleRepository from './role.repository.js';
import sessionService from './session.service.js';
import auditService from './audit.service.js';
import passwordHistoryRepository from './passwordHistory.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import {
  hashPassword,
  generateTempPassword,
  generateActivationToken,
} from '../../shared/utils/crypto.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';
import fileService from '../files/file.service.js';

const USER_CACHE_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_CACHE_TTL = { l1Ttl: 30, l2Ttl: 120 };

// Fields users can edit on their own profile
const SELF_EDITABLE_FIELDS = ['firstName', 'lastName', 'language', 'phone', 'department', 'position', 'street', 'city', 'zip', 'country'];

class UserService {
  /**
   * Admin creates a new user.
   */
  async createUser(data, createdBy, meta = {}) {
    // If no roleId provided, assign default 'User' role
    if (!data.roleId) {
      const defaultRole = await roleRepository.findByName('User');
      if (defaultRole) {
        data.roleId = defaultRole._id.toString();
      }
    }

    // Validate role exists
    const role = await roleRepository.findById(data.roleId);
    if (!role) throw new NotFoundError('Role', data.roleId);

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = await hashPassword(tempPassword);

    // Generate activation token
    const { token: activationToken, hashedToken, expires } = generateActivationToken();

    const user = await userRepository.create({
      email: data.email,
      passwordHash: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      department: data.department || null,
      position: data.position || null,
      street: data.street || null,
      city: data.city || null,
      zip: data.zip || null,
      country: data.country || 'Schweiz',
      language: data.language || 'de',
      schedulingSkills: data.schedulingSkills || [],
      schedulingCertifications: data.schedulingCertifications || [],
      role: data.roleId,
      status: 'pending_activation',
      activationTokenHash: hashedToken,
      activationTokenExpires: expires,
    });

    // Save initial password to history
    await passwordHistoryRepository.create(user._id, hashedPassword);

    // Enqueue activation email
    const activationUrl = `${config.client.uri}/activate?token=${activationToken}`;
    try {
      await queueManager.addJob('auth-email', 'send-activation-email', {
        email: data.email,
        name: data.firstName,
        activationUrl,
      });
    } catch (err) {
      logger.warn('Failed to enqueue activation email', {
        module: 'auth',
        action: 'createUser',
        error: { message: err.message },
      });
    }

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.USER_CREATED, {
      userId: user._id,
      email: user.email,
      roleId: data.roleId,
      createdBy,
    }, { source: 'auth:users' });

    auditService.logEvent({
      eventType: 'user.created',
      userId: createdBy,
      email: data.email,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { newUserId: user._id, roleId: data.roleId },
    });

    logger.info('User created', {
      module: 'auth',
      action: 'createUser',
      userId: user._id,
      email: data.email,
    });

    // Return sanitized user (no password fields)
    return userRepository.findById(user._id);
  }

  /**
   * Get user by ID with role populated.
   */
  async getById(id) {
    const cacheKey = `auth:user:${id}`;
    const user = await cacheManager.getOrSet(
      cacheKey,
      () => userRepository.findById(id),
      USER_CACHE_TTL,
    );
    if (!user) throw new NotFoundError('User', id);
    return this._enrichWithAvatarUrl(user);
  }

  /**
   * Get own profile.
   */
  async getMe(userId) {
    return this.getById(userId);
  }

  /**
   * Update own profile (restricted fields).
   */
  async updateMe(userId, data) {
    const filtered = {};
    for (const field of SELF_EDITABLE_FIELDS) {
      if (data[field] !== undefined) filtered[field] = data[field];
    }

    if (Object.keys(filtered).length === 0) {
      return this.getById(userId);
    }

    const updated = await userRepository.updateById(userId, filtered);
    await this._invalidateUserCache(userId);

    eventBus.publish(EVENT_TYPES.USER_UPDATED, {
      userId,
      updatedFields: Object.keys(filtered),
      updatedBy: userId,
    }, { source: 'auth:users' });

    return this._enrichWithAvatarUrl(updated);
  }

  /**
   * Admin updates a user.
   */
  async updateUser(id, data, updatedBy, meta = {}) {
    const existing = await userRepository.findById(id);
    if (!existing) throw new NotFoundError('User', id);

    const updateData = { ...data };

    // If roleId is provided, use it as role
    if (updateData.roleId) {
      const role = await roleRepository.findById(updateData.roleId);
      if (!role) throw new NotFoundError('Role', updateData.roleId);
      updateData.role = updateData.roleId;
      delete updateData.roleId;
    }

    const updated = await userRepository.updateById(id, updateData);
    await this._invalidateUserCache(id);
    await this._invalidateListCache();

    // If role changed, invalidate permission cache and publish event
    if (data.roleId && data.roleId.toString() !== existing.role?._id?.toString()) {
      await cacheManager.del(`auth:permissions:${id}`);

      eventBus.publish(EVENT_TYPES.USER_ROLE_CHANGED, {
        userId: id,
        oldRoleId: existing.role?._id,
        newRoleId: data.roleId,
        changedBy: updatedBy,
      }, { source: 'auth:users' });

      auditService.logEvent({
        eventType: 'role.changed',
        userId: updatedBy,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'success',
        details: { targetUserId: id, oldRoleId: existing.role?._id, newRoleId: data.roleId },
      });
    }

    eventBus.publish(EVENT_TYPES.USER_UPDATED, {
      userId: id,
      updatedFields: Object.keys(data),
      updatedBy,
    }, { source: 'auth:users' });

    logger.info('User updated', {
      module: 'auth',
      action: 'updateUser',
      userId: id,
      updatedBy,
    });

    return updated;
  }

  /**
   * Deactivate (soft delete) a user.
   */
  async deactivateUser(id, deactivatedBy, meta = {}) {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('User', id);

    // Prevent self-deactivation for admins
    if (id.toString() === deactivatedBy?.toString() && user.role?.name === 'Admin') {
      throw new ConflictError('Cannot deactivate your own admin account');
    }

    // Check if this is the last active admin
    if (user.role?.name === 'Admin') {
      const adminRole = await roleRepository.findByName('Admin');
      if (adminRole) {
        const adminCount = await userRepository.countActiveAdmins(adminRole._id);
        if (adminCount <= 1) {
          throw new ConflictError('Cannot deactivate the last admin user');
        }
      }
    }

    await userRepository.softDelete(id);

    // Revoke all sessions
    await sessionService.revokeAllUserSessions(id);

    // Invalidate caches
    await this._invalidateUserCache(id);
    await this._invalidateListCache();
    await cacheManager.del(`auth:permissions:${id}`);

    eventBus.publish(EVENT_TYPES.USER_DEACTIVATED, {
      userId: id,
      deactivatedBy,
    }, { source: 'auth:users' });

    auditService.logEvent({
      eventType: 'user.deactivated',
      userId: deactivatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { targetUserId: id, email: user.email },
    });

    logger.info('User deactivated', {
      module: 'auth',
      action: 'deactivateUser',
      userId: id,
      deactivatedBy,
    });
  }

  /**
   * List users with cursor pagination.
   */
  async listUsers(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;

    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `auth:users:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => userRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_CACHE_TTL,
    );
  }

  /**
   * Bulk update multiple users with the same data.
   */
  async bulkUpdateUsers(ids, data, updatedBy, meta = {}) {
    if (!ids || ids.length === 0) {
      return { modifiedCount: 0 };
    }

    // Validate all users exist
    const users = await userRepository.findByIds(ids);
    if (users.length !== ids.length) {
      const foundIds = users.map((u) => u._id.toString());
      const missing = ids.filter((id) => !foundIds.includes(id));
      throw new NotFoundError('Users', missing.join(', '));
    }

    const updateData = { ...data };

    // If roleId is provided, validate it and map to role field
    if (updateData.roleId) {
      const role = await roleRepository.findById(updateData.roleId);
      if (!role) throw new NotFoundError('Role', updateData.roleId);
      updateData.role = updateData.roleId;
      delete updateData.roleId;
    }

    const modifiedCount = await userRepository.bulkUpdate(ids, updateData);

    // Invalidate caches for all affected users
    for (const id of ids) {
      await this._invalidateUserCache(id);
      if (data.roleId) {
        await cacheManager.del(`auth:permissions:${id}`);
      }
    }
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.USER_UPDATED, {
      userIds: ids,
      updatedFields: Object.keys(data),
      updatedBy,
      bulk: true,
    }, { source: 'auth:users' });

    auditService.logEvent({
      eventType: 'user.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { targetUserIds: ids, updatedFields: Object.keys(data), bulk: true },
    });

    logger.info('Bulk user update', {
      module: 'auth',
      action: 'bulkUpdateUsers',
      count: modifiedCount,
      updatedBy,
    });

    return { modifiedCount };
  }

  /**
   * Bulk deactivate (soft delete) multiple users.
   */
  async bulkDeactivateUsers(ids, deactivatedBy, meta = {}) {
    if (!ids || ids.length === 0) {
      return { deactivatedCount: 0 };
    }

    // Validate all users exist
    const users = await userRepository.findByIds(ids);
    if (users.length === 0) {
      throw new NotFoundError('Users', ids.join(', '));
    }

    // Check none of them is the last admin
    const adminUsers = users.filter((u) => u.role?.name === 'Admin');
    if (adminUsers.length > 0) {
      const adminRole = await roleRepository.findByName('Admin');
      if (adminRole) {
        const totalAdmins = await userRepository.countActiveAdmins(adminRole._id);
        const adminsBeingDeleted = adminUsers.length;
        if (totalAdmins - adminsBeingDeleted < 1) {
          throw new ConflictError(
            'Cannot deactivate: at least one admin user must remain active',
          );
        }
      }
    }

    // Prevent self-deactivation
    if (ids.includes(deactivatedBy?.toString())) {
      throw new ConflictError('Cannot deactivate your own account in a bulk operation');
    }

    const deactivatedCount = await userRepository.bulkSoftDelete(ids);

    // Revoke sessions and invalidate caches for all affected users
    for (const id of ids) {
      await sessionService.revokeAllUserSessions(id);
      await this._invalidateUserCache(id);
      await cacheManager.del(`auth:permissions:${id}`);
    }
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.USER_DEACTIVATED, {
      userIds: ids,
      deactivatedBy,
      bulk: true,
    }, { source: 'auth:users' });

    auditService.logEvent({
      eventType: 'user.deactivated',
      userId: deactivatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { targetUserIds: ids, deactivatedCount, bulk: true },
    });

    logger.info('Bulk user deactivation', {
      module: 'auth',
      action: 'bulkDeactivateUsers',
      count: deactivatedCount,
      deactivatedBy,
    });

    return { deactivatedCount };
  }

  /**
   * Enrich a user object with avatarUrl (presigned S3 URL) if avatarFileId is set.
   * Returns the user as-is if no avatar exists.
   */
  async _enrichWithAvatarUrl(user) {
    if (!user) return user;

    if (user.avatarFileId) {
      try {
        const url = await fileService.getDownloadUrl(user.avatarFileId);
        return { ...user, avatarUrl: url };
      } catch (err) {
        // Avatar file may have been deleted — return user without avatarUrl
        logger.warn('Failed to resolve avatar URL', {
          module: 'auth',
          action: '_enrichWithAvatarUrl',
          userId: user._id,
          avatarFileId: user.avatarFileId,
          error: { message: err.message },
        });
        return { ...user, avatarUrl: null };
      }
    }

    return { ...user, avatarUrl: null };
  }

  async _invalidateUserCache(userId) {
    await cacheManager.del(`auth:user:${userId}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}auth:users:list:*`);
  }
}

const userService = new UserService();
export default userService;
