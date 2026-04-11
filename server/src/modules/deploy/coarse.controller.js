import coarseService from './coarse.service.js';

class CoarseController {
  async getMatrix(req, res, next) {
    try {
      const { year, weekFrom, weekTo, employeeIds, projectId, view } = req.query;
      const filters = {};
      if (employeeIds) filters.employeeIds = employeeIds.split(',').filter(Boolean);
      if (projectId) filters.projectId = projectId;
      filters.view = view;

      const matrix = await coarseService.getMatrix(
        Number(year),
        Number(weekFrom),
        Number(weekTo),
        filters,
      );
      return res.success({ data: matrix });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const allocation = await coarseService.create(req.body, req.user._id, meta);
      return res.success({ data: allocation, message: 'Coarse allocation created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const allocation = await coarseService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: allocation, message: 'Coarse allocation updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await coarseService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Coarse allocation deleted successfully' });
    } catch (err) { next(err); }
  }

  async bulkUpsert(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await coarseService.bulkUpsert(req.body.allocations, req.user._id, meta);
      return res.success({ data: result, message: 'Coarse allocations bulk upserted successfully' });
    } catch (err) { next(err); }
  }
}

const coarseController = new CoarseController();
export default coarseController;
