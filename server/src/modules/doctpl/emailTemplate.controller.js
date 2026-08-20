import emailTemplateService from './emailTemplate.service.js';

class EmailTemplateController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await emailTemplateService.create(req.body, req.user._id, meta);
      return res.success({ data: template, message: 'Email template created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const data = await emailTemplateService.list();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const template = await emailTemplateService.getById(req.params.id);
      return res.success({ data: template });
    } catch (err) { next(err); }
  }

  // Resolve a template's placeholders against the record the email starts from.
  async render(req, res, next) {
    try {
      const data = await emailTemplateService.render(req.params.id, { ...req.body, user: req.user });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await emailTemplateService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: template, message: 'Email template updated successfully' });
    } catch (err) { next(err); }
  }

  async duplicate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await emailTemplateService.duplicate(req.params.id, req.user._id, meta);
      return res.success({ data: template, message: 'Email template duplicated successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await emailTemplateService.remove(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Email template deleted successfully' });
    } catch (err) { next(err); }
  }
}

const emailTemplateController = new EmailTemplateController();
export default emailTemplateController;
