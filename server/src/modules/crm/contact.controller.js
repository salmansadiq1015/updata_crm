import contactService from './contact.service.js';

class ContactController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const contact = await contactService.create(req.params.customerId, req.body, req.user._id, meta);
      return res.success({ data: contact, message: 'Contact created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listByCustomer(req, res, next) {
    try {
      const data = await contactService.listByCustomer(req.params.customerId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const contact = await contactService.getById(req.params.id);
      return res.success({ data: contact });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const contact = await contactService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: contact, message: 'Contact updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await contactService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Contact deleted successfully' });
    } catch (err) { next(err); }
  }

  async setPrimary(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const contact = await contactService.setPrimary(req.params.id, req.user._id, meta);
      return res.success({ data: contact, message: 'Primary contact updated successfully' });
    } catch (err) { next(err); }
  }

  async listAll(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 500;
      const data = await contactService.listAll(Math.min(limit, 1000));
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async search(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await contactService.search(query.q, query.limit);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const contactController = new ContactController();
export default contactController;
