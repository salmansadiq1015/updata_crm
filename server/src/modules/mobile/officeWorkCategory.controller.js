import OfficeWorkCategory from './officeWorkCategory.model.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

class OfficeWorkCategoryController {
  async list(req, res, next) {
    try {
      const filter = req.query?.includeInactive ? {} : { isActive: true };
      const data = await OfficeWorkCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const category = await OfficeWorkCategory.create({ ...req.body, createdBy: req.user._id });
      auditService.logEvent({
        eventType: 'office_work_category.created',
        userId: req.user._id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result: 'success',
        details: { categoryId: category._id, name: category.name },
        module: 'mobile',
      });
      return res.success({ data: category, message: 'Category created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const category = await OfficeWorkCategory.findByIdAndUpdate(
        req.params.id, req.body, { returnDocument: 'after', runValidators: true },
      ).lean();
      if (!category) throw new NotFoundError('OfficeWorkCategory', req.params.id);
      return res.success({ data: category, message: 'Category updated successfully' });
    } catch (err) { next(err); }
  }

  // Deactivate rather than delete: entries already booked keep their category.
  async remove(req, res, next) {
    try {
      const category = await OfficeWorkCategory.findByIdAndUpdate(
        req.params.id, { isActive: false }, { returnDocument: 'after' },
      ).lean();
      if (!category) throw new NotFoundError('OfficeWorkCategory', req.params.id);
      return res.success({ message: 'Category deactivated successfully' });
    } catch (err) { next(err); }
  }
}

const officeWorkCategoryController = new OfficeWorkCategoryController();
export default officeWorkCategoryController;
