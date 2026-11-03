import Department from './department.model.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';

class DepartmentController {
  async list(req, res, next) {
    try {
      const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
      // Scope: 'qop' → commercial (numbering) departments; 'tasks' → task-board
      // departments; omitted → all. Backward compatible (QOP passes scope=qop).
      if (req.query.scope === 'qop') filter.scopeQop = { $ne: false };
      else if (req.query.scope === 'tasks') filter.scopeTasks = { $ne: false };
      const departments = await Department.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
      return res.success({ data: departments });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const { name, code, color, icon, sortOrder, scopeQop, scopeTasks } = req.body;
      const existing = await Department.findOne({ code: code.toUpperCase() });
      if (existing) throw new ConflictError(`Department code '${code}' already exists`);
      const department = await Department.create({ name, code, color, icon, sortOrder, scopeQop, scopeTasks });
      return res.success({ data: department, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const updates = {};
      for (const f of ['name', 'isActive', 'color', 'icon', 'sortOrder', 'scopeQop', 'scopeTasks']) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }
      const department = await Department.findByIdAndUpdate(
        req.params.id,
        updates,
        { returnDocument: 'after', runValidators: true },
      );
      if (!department) throw new NotFoundError('Department not found');
      return res.success({ data: department });
    } catch (err) { next(err); }
  }
}

const departmentController = new DepartmentController();
export default departmentController;
