import templateService from './template.service.js';

class TemplateController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await templateService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const template = await templateService.getById(req.params.id);
      return res.success({ data: template });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await templateService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: template, message: 'Template updated successfully' });
    } catch (err) { next(err); }
  }

  async listVersions(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await templateService.listVersions(req.params.id, query);
      return res.success({ data: result.data, total: result.total });
    } catch (err) { next(err); }
  }

  async getVersion(req, res, next) {
    try {
      const version = await templateService.getVersion(req.params.id, Number(req.params.version));
      return res.success({ data: version });
    } catch (err) { next(err); }
  }

  async revertToVersion(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await templateService.revertToVersion(
        req.params.id,
        Number(req.params.version),
        req.user._id,
        meta,
      );
      return res.success({ data: template, message: 'Template reverted successfully' });
    } catch (err) { next(err); }
  }

  async preview(req, res, next) {
    try {
      const result = await templateService.preview(req.params.id, req.body.sampleData, req.body.language);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }
}

const templateController = new TemplateController();
export default templateController;
