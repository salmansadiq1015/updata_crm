import userService from './user.service.js';
import sessionService from './session.service.js';
import auditService from './audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import { parseAiAgentDefaults } from './user.validation.js';

/**
 * User controller — HTTP layer only.
 */
class UserController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const user = await userService.createUser(req.body, req.user._id, meta);
      return res.success({ data: user, message: 'User created successfully', statusCode: 201 });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await userService.listUsers(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const user = await userService.getById(req.params.id);
      return res.success({ data: user });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const user = await userService.updateUser(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: user, message: 'User updated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async deactivate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const user = await userService.deactivateUser(req.params.id, req.user._id, meta);
      return res.success({ data: user, message: 'User deactivated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async activate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const user = await userService.activateUser(req.params.id, req.user._id, meta);
      return res.success({ data: user, message: 'User activated successfully' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /users/directory — returns a lightweight list of active users for
   * task assignment and @-mention purposes. Available to all authenticated
   * users (no admin permission required).
   */
  async directory(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await userService.listUsers({
        status: 'active',
        limit: query.limit || 80,
        search: query.search || undefined,
        sortBy: 'firstName',
        sortOrder: 'asc',
      });
      const users = (result.data ?? []).map((u) => ({
        _id: u._id ?? u.id,
        id: u._id ?? u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        avatarUrl: u.avatarUrl ?? u.avatar ?? null,
      }));
      return res.success({ data: users });
    } catch (err) {
      next(err);
    }
  }

  async assignmentTargets(req, res, next) {
    try {
      const targets = await userService.listAssignmentTargets();
      return res.success({ data: targets });
    } catch (err) {
      next(err);
    }
  }

  async getMe(req, res, next) {
    try {
      const user = await userService.getMe(req.user._id);
      return res.success({ data: user });
    } catch (err) {
      next(err);
    }
  }

  async updateMe(req, res, next) {
    try {
      const user = await userService.updateMe(req.user._id, req.body);
      return res.success({ data: user, message: 'Profile updated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async uploadAvatar(req, res, next) {
    try {
      // Delegate to file service (imported lazily to avoid circular deps)
      const fileService = (await import('../files/file.service.js')).default;

      if (!req.file) {
        return res.fail({
          statusCode: 400,
          code: 'FILE_REQUIRED',
          message: 'No file provided',
        });
      }

      // Determine target user: own avatar or admin changing another user's
      const targetUserId = req.params.id;
      const isOwnAvatar = targetUserId === req.user._id.toString();

      if (!isOwnAvatar && req.user.role?.name !== 'Admin') {
        return res.fail({
          statusCode: 403,
          message: 'You can only update your own avatar.',
          code: 'INSUFFICIENT_PERMISSIONS',
        });
      }

      const result = await fileService.upload({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        module: 'auth',
        entityType: 'avatar',
        entityId: targetUserId,
        uploadedBy: req.user._id,
        bucket: 'images',
      });

      // Remove old avatar file if one exists
      const { default: userRepository } = await import('./user.repository.js');
      const existingUser = await userRepository.findById(targetUserId);
      if (existingUser?.avatarFileId) {
        try {
          await fileService.delete(existingUser.avatarFileId);
        } catch {
          // Old file may already be deleted — continue
        }
      }

      // Update user's avatarFileId
      await userRepository.updateById(targetUserId, { avatarFileId: result._id });

      // Invalidate user cache so fetchMe returns fresh data with new avatarFileId
      await cacheManager.del(`auth:user:${targetUserId}`);

      // Return the presigned URL for immediate use
      const avatarUrl = await fileService.getDownloadUrl(result._id);
      const fileData = result.toJSON ? result.toJSON() : result;

      return res.success({
        data: { ...fileData, avatarUrl },
        message: 'Avatar uploaded successfully',
        statusCode: 201,
      });
    } catch (err) {
      next(err);
    }
  }

  async removeAvatar(req, res, next) {
    try {
      const targetUserId = req.params.id;
      const isOwnAvatar = targetUserId === req.user._id.toString();

      if (!isOwnAvatar && req.user.role?.name !== 'Admin') {
        return res.fail({
          statusCode: 403,
          message: 'You can only remove your own avatar.',
          code: 'INSUFFICIENT_PERMISSIONS',
        });
      }

      const { default: userRepository } = await import('./user.repository.js');
      const user = await userRepository.findById(targetUserId);
      if (user?.avatarFileId) {
        const fileService = (await import('../files/file.service.js')).default;
        await fileService.delete(user.avatarFileId);
      }

      await userRepository.updateById(targetUserId, { avatarFileId: null });

      // Invalidate user cache so fetchMe returns fresh data without avatar
      await cacheManager.del(`auth:user:${targetUserId}`);

      return res.success({ message: 'Avatar removed successfully' });
    } catch (err) {
      next(err);
    }
  }

  async updatePreferences(req, res, next) {
    try {
      const User = (await import('./user.model.js')).default;
      const { preferredDepartmentId, dashboard, siteDetail, startPage, aiAgentDefaults } = req.body || {};
      const updates = {};

      // AI agent defaults: validated with the campaign rules; replaced as a whole
      // (the app always sends the full form), `null` clears them.
      if (aiAgentDefaults !== undefined) {
        updates['preferences.aiAgentDefaults'] = parseAiAgentDefaults(aiAgentDefaults);
      }

      if (startPage !== undefined) {
        updates['preferences.startPage'] = (typeof startPage === 'string' && startPage.trim()) ? startPage.trim().slice(0, 200) : null;
      }

      if (preferredDepartmentId !== undefined) {
        updates['preferences.preferredDepartmentId'] = preferredDepartmentId || null;
      }
      if (dashboard) {
        if (Array.isArray(dashboard.hiddenKpis)) {
          updates['preferences.dashboard.hiddenKpis'] = dashboard.hiddenKpis;
        }
        if (Array.isArray(dashboard.hiddenTabs)) {
          updates['preferences.dashboard.hiddenTabs'] = dashboard.hiddenTabs;
        }
      }
      if (siteDetail && Array.isArray(siteDetail.hiddenTabs)) {
        updates['preferences.siteDetail.hiddenTabs'] = siteDetail.hiddenTabs;
      }

      const updated = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updates },
        { new: true, select: 'preferences' },
      ).lean();
      // Invalidate the cached /me so a reload returns the updated preferences.
      await cacheManager.del(`auth:user:${req.user._id}`);
      return res.success({ data: { preferences: updated?.preferences ?? {} } });
    } catch (err) { next(err); }
  }

  /**
   * Admin: bulk update multiple users.
   */
  async bulkUpdate(req, res, next) {
    try {
      const { ids, data } = req.body;
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await userService.bulkUpdateUsers(ids, data, req.user._id, meta);
      return res.success({
        data: result,
        message: `${result.modifiedCount} user(s) updated successfully`,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: bulk deactivate (soft delete) multiple users.
   */
  async bulkDeactivate(req, res, next) {
    try {
      const { ids } = req.body;
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await userService.bulkDeactivateUsers(ids, req.user._id, meta);
      return res.success({
        data: result,
        message: `${result.deactivatedCount} user(s) deactivated successfully`,
      });
    } catch (err) {
      next(err);
    }
  }

  async listAssignedProjects(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await userService.listAssignedProjects(req.params.id, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }

  async assignProject(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const project = await userService.assignProject(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: project, message: 'Project assigned successfully' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: list sessions for a specific user.
   */
  async listUserSessions(req, res, next) {
    try {
      const sessions = await sessionService.getSessionsByUser(req.params.id);
      return res.success({ data: sessions });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: revoke all sessions for a specific user.
   */
  async revokeUserSessions(req, res, next) {
    try {
      const count = await sessionService.revokeAllUserSessions(req.params.id);

      auditService.logEvent({
        eventType: 'session.revoked',
        userId: req.user._id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result: 'success',
        details: { targetUserId: req.params.id, revokedCount: count, revokedBy: 'admin' },
      });

      return res.success({
        data: { revokedCount: count },
        message: `${count} session(s) revoked for user.`,
      });
    } catch (err) {
      next(err);
    }
  }
}

const userController = new UserController();
export default userController;
