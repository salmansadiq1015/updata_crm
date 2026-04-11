import catalogCategoryService from './catalogCategory.service.js';

class CatalogCategoryController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await catalogCategoryService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const category = await catalogCategoryService.getById(req.params.id);
      return res.success({ data: category });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const category = await catalogCategoryService.create(req.body, req.user._id, meta);
      return res.success({ data: category, message: 'Category created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const category = await catalogCategoryService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: category, message: 'Category updated successfully' });
    } catch (err) { next(err); }
  }

  async move(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const category = await catalogCategoryService.move(req.params.id, req.body.newParentId, req.user._id, meta);
      return res.success({ data: category, message: 'Category moved successfully' });
    } catch (err) { next(err); }
  }

  async deactivate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const category = await catalogCategoryService.deactivate(req.params.id, req.user._id, meta);
      return res.success({ data: category, message: 'Category deactivated successfully' });
    } catch (err) { next(err); }
  }
}

const catalogCategoryController = new CatalogCategoryController();
export default catalogCategoryController;
