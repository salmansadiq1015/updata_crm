import templateService from './template.service.js';

class TemplateController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await templateService.create(req.body, req.user._id, meta);
      return res.success({ data: template, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async duplicate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await templateService.duplicate(req.params.id, req.user._id, meta);
      return res.success({ data: template, message: 'Template duplicated successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

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

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await templateService.remove(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Template deleted successfully' });
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

  async compareVersions(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await templateService.compareVersions(
        req.params.id,
        Number(query.fromVersion),
        Number(query.toVersion),
      );
      return res.success({ data: result });
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
        req.body?.expectedVersion,
      );
      return res.success({ data: template, message: 'Template reverted successfully' });
    } catch (err) { next(err); }
  }

  async requestApproval(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await templateService.requestApproval(req.params.id, req.user._id, req.body?.note, meta);
      return res.success({ data: template, message: 'Approval requested' });
    } catch (err) { next(err); }
  }

  async approve(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await templateService.approve(req.params.id, req.user._id, req.body?.note, meta);
      return res.success({ data: template, message: 'Template approved' });
    } catch (err) { next(err); }
  }

  async reject(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await templateService.reject(req.params.id, req.user._id, req.body.reason, meta);
      return res.success({ data: template, message: 'Template rejected' });
    } catch (err) { next(err); }
  }

  async preview(req, res, next) {
    try {
      const result = await templateService.preview(
        req.params.id,
        req.body.sampleData,
        req.body.language,
        req.body.draftTemplate,
      );
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async previewVersion(req, res, next) {
    try {
      const result = await templateService.previewVersion(
        req.params.id,
        Number(req.params.version),
        req.body.sampleData,
        req.body.language,
      );
      return res.success({ data: result });
    } catch (err) { next(err); }
  }
}

const templateController = new TemplateController();
export default templateController;
