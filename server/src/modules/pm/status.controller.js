import statusService from './status.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';

class StatusController {
  async transitionStatus(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { targetStatus, comment, override, overrideReason } = req.body;

      if (override) {
        const hasOverride = await this._hasOverridePermission(req.user);
        if (!hasOverride) {
          return res.fail({
            statusCode: 403,
            message: 'Status override requires projects:admin permission.',
            code: 'INSUFFICIENT_PERMISSIONS',
          });
        }
      }

      const result = await statusService.transitionStatus(
        req.params.id,
        targetStatus,
        { comment, override, overrideReason },
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Project status updated successfully' });
    } catch (err) { next(err); }
  }

  async _hasOverridePermission(user) {
    if (user.role?.name === 'Admin') return true;
    const cacheKey = `auth:permissions:${user._id}`;
    const permissions = await cacheManager.get(cacheKey);
    if (Array.isArray(permissions)) {
      return permissions.includes('projects:admin');
    }
    const UserModel = (await import('../auth/user.model.js')).default;
    const populated = await UserModel.findById(user._id)
      .populate({ path: 'role', populate: { path: 'permissions' } })
      .lean();
    if (!populated?.role?.permissions) return false;
    return populated.role.permissions.some(
      (p) => `${p.module}:${p.action}` === 'projects:admin',
    );
  }

  async getStatusHistory(req, res, next) {
    try {
      const history = await statusService.getStatusHistory(req.params.id);
      return res.success({ data: history });
    } catch (err) { next(err); }
  }
}

const statusController = new StatusController();
export default statusController;
