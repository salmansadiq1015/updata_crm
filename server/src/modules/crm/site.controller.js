import siteService from './site.service.js';

class SiteController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const site = await siteService.create(req.params.customerId, req.body, req.user._id, meta);
      return res.success({ data: site, message: 'Site created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listByCustomer(req, res, next) {
    try {
      const data = await siteService.listByCustomer(req.params.customerId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await siteService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const site = await siteService.getById(req.params.id);
      return res.success({ data: site });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const site = await siteService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: site, message: 'Site updated successfully' });
    } catch (err) { next(err); }
  }

  async deactivate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const site = await siteService.deactivate(req.params.id, req.user._id, meta);
      return res.success({ data: site, message: 'Site deactivated successfully' });
    } catch (err) { next(err); }
  }

  async getActivity(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await siteService.getActivity(req.params.id, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async exportActivity(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { content, mimeType, extension } = await siteService.exportActivity(req.params.id, query);
      const filename = `site-${req.params.id}-activity-${new Date().toISOString().split('T')[0]}.${extension}`;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(content);
    } catch (err) { next(err); }
  }
}

const siteController = new SiteController();
export default siteController;
