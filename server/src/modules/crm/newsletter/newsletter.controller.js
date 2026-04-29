import newsletterService from './newsletter.service.js';

class NewsletterController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const newsletter = await newsletterService.create(req.body, req.user._id, meta);
      return res.success({ data: newsletter, message: 'Newsletter created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await newsletterService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const newsletter = await newsletterService.getById(req.params.id);
      return res.success({ data: newsletter });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const newsletter = await newsletterService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: newsletter, message: 'Newsletter updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await newsletterService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Newsletter deleted successfully' });
    } catch (err) { next(err); }
  }

  async schedule(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const newsletter = await newsletterService.schedule(
        req.params.id,
        req.body.scheduledAt,
        req.user._id,
        meta,
      );
      return res.success({ data: newsletter, message: 'Newsletter scheduled successfully' });
    } catch (err) { next(err); }
  }

  async cancel(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const newsletter = await newsletterService.cancel(req.params.id, req.user._id, meta);
      return res.success({ data: newsletter, message: 'Newsletter cancelled' });
    } catch (err) { next(err); }
  }

  async send(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const newsletter = await newsletterService.send(req.params.id, req.user._id, meta);
      return res.success({ data: newsletter, message: 'Newsletter sending initiated' });
    } catch (err) { next(err); }
  }

  async getStats(req, res, next) {
    try {
      const stats = await newsletterService.getStats(req.params.id);
      return res.success({ data: stats });
    } catch (err) { next(err); }
  }

  async countRecipients(req, res, next) {
    try {
      const count = await newsletterService.countRecipients(req.body.recipientFilter);
      return res.success({ data: { count } });
    } catch (err) { next(err); }
  }
}

const newsletterController = new NewsletterController();
export default newsletterController;
