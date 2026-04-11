import roleService from './role.service.js';

/**
 * Role controller — HTTP layer only.
 */
class RoleController {
  async list(req, res, next) {
    try {
      const roles = await roleService.listRoles();
      return res.success({ data: roles });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const role = await roleService.getById(req.params.id);
      return res.success({ data: role });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const role = await roleService.createRole(req.body);
      return res.success({ data: role, message: 'Role created successfully', statusCode: 201 });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const role = await roleService.updateRole(req.params.id, req.body);
      return res.success({ data: role, message: 'Role updated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      await roleService.deleteRole(req.params.id);
      return res.success({ message: 'Role deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  async listPermissions(req, res, next) {
    try {
      const permissions = await roleService.listPermissions();
      return res.success({ data: permissions });
    } catch (err) {
      next(err);
    }
  }
}

const roleController = new RoleController();
export default roleController;
