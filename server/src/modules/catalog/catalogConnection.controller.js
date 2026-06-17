import catalogConnectionService from './catalogConnection.service.js';

class CatalogConnectionController {
  async create(req, res, next) {
    try {
      const connection = await catalogConnectionService.create(
        req.body,
        req.user._id,
        { ipAddress: req.ip, userAgent: req.get('user-agent') },
      );
      return res.success({ data: connection, message: 'Catalog connection created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const result = await catalogConnectionService.list(req._validatedQuery || req.query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const connection = await catalogConnectionService.getById(req.params.id);
      return res.success({ data: connection });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const connection = await catalogConnectionService.update(
        req.params.id,
        req.body,
        req.user._id,
        { ipAddress: req.ip, userAgent: req.get('user-agent') },
      );
      return res.success({ data: connection, message: 'Catalog connection updated' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      await catalogConnectionService.delete(
        req.params.id,
        req.user._id,
        { ipAddress: req.ip, userAgent: req.get('user-agent') },
      );
      return res.success({ message: 'Catalog connection deleted' });
    } catch (err) { next(err); }
  }

  async triggerSync(req, res, next) {
    try {
      const job = await catalogConnectionService.triggerSync(
        req.params.id,
        req.user._id,
        req.body?.mode || 'MANUAL',
      );
      return res.success({ data: job, message: 'Catalog sync queued', statusCode: 202 });
    } catch (err) { next(err); }
  }

  async getLogs(req, res, next) {
    try {
      const logs = await catalogConnectionService.getLogs(req.params.id, req.query);
      return res.success({ data: logs });
    } catch (err) { next(err); }
  }
}

const catalogConnectionController = new CatalogConnectionController();
export default catalogConnectionController;
