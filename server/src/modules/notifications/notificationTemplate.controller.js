import notificationTemplateService from './notificationTemplate.service.js';

class NotificationTemplateController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await notificationTemplateService.create(req.body, req.user._id, meta);
      return res.success({ data: template, message: 'Template created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const template = await notificationTemplateService.getById(req.params.id);
      return res.success({ data: template });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await notificationTemplateService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await notificationTemplateService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: template, message: 'Template updated successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await notificationTemplateService.remove(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Template deleted successfully' });
    } catch (err) { next(err); }
  }

  async preview(req, res, next) {
    try {
      const result = await notificationTemplateService.preview(req.params.id, req.body);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }
}

const notificationTemplateController = new NotificationTemplateController();
export default notificationTemplateController;
