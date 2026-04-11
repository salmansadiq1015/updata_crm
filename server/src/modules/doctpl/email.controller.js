import emailService from './email.service.js';

class EmailController {
  async send(req, res, next) {
    try {
      const emailRecord = await emailService.send({
        ...req.body,
        createdBy: req.user._id,
        meta: { ipAddress: req.ip, userAgent: req.get('user-agent') },
      });
      return res.success({ data: emailRecord, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async compose(req, res, next) {
    try {
      const result = await emailService.compose(req.body);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await emailService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const record = await emailService.getById(req.params.id);
      return res.success({ data: record });
    } catch (err) { next(err); }
  }

  async retry(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const record = await emailService.retry(req.params.id, req.user._id, meta);
      return res.success({ data: record, message: 'Email retry queued' });
    } catch (err) { next(err); }
  }
}

const emailController = new EmailController();
export default emailController;
