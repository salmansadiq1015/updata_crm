import roleRepository from './role.repository.js';
import permissionRepository from './permission.repository.js';
import userRepository from './user.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';
import config from '../../config/index.js';

const ROLE_CACHE_TTL = { l1Ttl: 60, l2Ttl: 300 };

class RoleService {
  async getById(id) {
    const cacheKey = `auth:role:${id}`;
    const role = await cacheManager.getOrSet(
      cacheKey,
      () => roleRepository.findById(id),
      ROLE_CACHE_TTL,
    );
    if (!role) throw new NotFoundError('Role', id);
    return role;
  }

  async listRoles() {
    const cacheKey = 'auth:roles:all';
    const roles = await cacheManager.getOrSet(
      cacheKey,
      () => roleRepository.findAll(),
      ROLE_CACHE_TTL,
    );
    // userCount is computed fresh (outside the cache) so the "Benutzer" column
    // reflects role assignments immediately instead of always showing 0.
    const counts = await userRepository.countGroupedByRole();
    return roles.map((role) => ({ ...role, userCount: counts[String(role._id)] || 0 }));
  }

  async createRole(data) {
    // Validate permission IDs exist
    if (data.permissions?.length) {
      const existing = await permissionRepository.findByIds(data.permissions);
      if (existing.length !== data.permissions.length) {
        throw new ValidationError('Some permission IDs are invalid', [
          { field: 'permissions', message: 'One or more permission IDs do not exist' },
        ]);
      }
    }

    const role = await roleRepository.create({
      ...data,
      isSystem: false,
    });

    await this._invalidateCache();

    eventBus.publish(EVENT_TYPES.ROLE_CREATED, {
      roleId: role._id,
      name: role.name,
    }, { source: 'auth:roles' });

    logger.info('Role created', {
      module: 'auth',
      action: 'createRole',
      roleId: role._id,
      name: role.name,
    });

    return roleRepository.findById(role._id);
  }

  async updateRole(id, data) {
    const existing = await roleRepository.findById(id);
    if (!existing) throw new NotFoundError('Role', id);

    // Validate permission IDs if changing
    if (data.permissions?.length) {
      const perms = await permissionRepository.findByIds(data.permissions);
      if (perms.length !== data.permissions.length) {
        throw new ValidationError('Some permission IDs are invalid', [
          { field: 'permissions', message: 'One or more permission IDs do not exist' },
        ]);
      }
    }

    // Mark system role as customized if modifying
    if (existing.isSystem) {
      data.isCustomized = true;
    }

    const updated = await roleRepository.updateById(id, data);

    // Invalidate caches: role cache + permission cache for all users with this role
    await this._invalidateCache();
    await this._invalidatePermissionCacheForRole(id);

    eventBus.publish(EVENT_TYPES.ROLE_UPDATED, {
      roleId: updated._id,
      name: updated.name,
    }, { source: 'auth:roles' });

    logger.info('Role updated', {
      module: 'auth',
      action: 'updateRole',
      roleId: id,
    });

    return updated;
  }

  async deleteRole(id) {
    const role = await roleRepository.findById(id);
    if (!role) throw new NotFoundError('Role', id);

    if (role.isSystem) {
      throw new ConflictError('Cannot delete a system role');
    }

    const userCount = await userRepository.countByRole(id);
    if (userCount > 0) {
      throw new ConflictError(`Cannot delete role assigned to ${userCount} user(s)`);
    }

    await roleRepository.softDelete(id);
    await this._invalidateCache();

    eventBus.publish(EVENT_TYPES.ROLE_DELETED, {
      roleId: id,
      name: role.name,
    }, { source: 'auth:roles' });

    logger.info('Role deleted', {
      module: 'auth',
      action: 'deleteRole',
      roleId: id,
      name: role.name,
    });
  }

  async listPermissions() {
    return permissionRepository.findGroupedByModule();
  }

  async _invalidateCache() {
    await cacheManager.del('auth:roles:all');
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}auth:role:*`);
  }

  /**
   * Invalidate permission cache for all users with a specific role.
   */
  async _invalidatePermissionCacheForRole(roleId) {
    // Get all users with this role and invalidate their permission cache
    // Using a pattern invalidation since we can't efficiently query all user IDs here
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}auth:permissions:*`);
    // Cached /me responses embed the populated role (incl. uiConfig) — clear them
    // so a Key-User config change reaches users without waiting for the TTL.
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}auth:user:*`);
  }
}

const roleService = new RoleService();
export default roleService;
