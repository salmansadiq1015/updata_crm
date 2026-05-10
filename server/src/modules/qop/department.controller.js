import Department from './department.model.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';

class DepartmentController {
  async list(req, res, next) {
    try {
      const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
      const departments = await Department.find(filter).sort({ name: 1 }).lean();
      return res.success({ data: departments });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const { name, code } = req.body;
      const existing = await Department.findOne({ code: code.toUpperCase() });
      if (existing) throw new ConflictError(`Department code '${code}' already exists`);
      const department = await Department.create({ name, code });
      return res.success({ data: department, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const { name, isActive } = req.body;
      const department = await Department.findByIdAndUpdate(
        req.params.id,
        { name, isActive },
        { new: true, runValidators: true },
      );
      if (!department) throw new NotFoundError('Department not found');
      return res.success({ data: department });
    } catch (err) { next(err); }
  }
}

const departmentController = new DepartmentController();
export default departmentController;
