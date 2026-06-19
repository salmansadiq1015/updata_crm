import fieldTicketService from './fieldTicket.service.js';

function requestMeta(req) {
  return { ipAddress: req.ip, userAgent: req.get('user-agent') };
}

class FieldTicketController {
  async list(req, res, next) {
    try {
      const result = await fieldTicketService.list(req._validatedQuery || req.query);
      return res.success({
        data: result,
        pagination: result.pagination,
      });
    } catch (err) { next(err); }
  }

  async summary(req, res, next) {
    try {
      const result = await fieldTicketService.list({ ...(req._validatedQuery || req.query), limit: 1 });
      return res.success({ data: result.summary });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const ticket = await fieldTicketService.create(req.body, req.user._id, requestMeta(req));
      return res.success({ data: ticket, message: 'Field ticket created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const ticket = await fieldTicketService.getById(req.params.id);
      return res.success({ data: ticket });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const ticket = await fieldTicketService.update(req.params.id, req.body, req.user._id, requestMeta(req));
      return res.success({ data: ticket, message: 'Field ticket updated successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const ticket = await fieldTicketService.remove(req.params.id, req.user._id, requestMeta(req));
      return res.success({ data: ticket, message: 'Field ticket deleted successfully' });
    } catch (err) { next(err); }
  }

  async assign(req, res, next) {
    try {
      const ticket = await fieldTicketService.assign(req.params.id, req.body, req.user._id, requestMeta(req));
      return res.success({ data: ticket, message: 'Field ticket assigned successfully' });
    } catch (err) { next(err); }
  }

  async changeStatus(req, res, next) {
    try {
      const ticket = await fieldTicketService.changeStatus(req.params.id, req.body.status, req.user._id, requestMeta(req));
      return res.success({ data: ticket, message: 'Field ticket status updated successfully' });
    } catch (err) { next(err); }
  }

  async addComment(req, res, next) {
    try {
      const ticket = await fieldTicketService.addComment(req.params.id, req.body, req.user._id, requestMeta(req));
      return res.success({ data: ticket, message: 'Field ticket comment added successfully' });
    } catch (err) { next(err); }
  }

  async addAttachment(req, res, next) {
    try {
      const ticket = await fieldTicketService.addAttachment(req.params.id, req.body, req.user._id, requestMeta(req));
      return res.success({ data: ticket, message: 'Field ticket attachment added successfully' });
    } catch (err) { next(err); }
  }

  async activity(req, res, next) {
    try {
      const activity = await fieldTicketService.getActivity(req.params.id);
      return res.success({ data: activity });
    } catch (err) { next(err); }
  }

  async analyze(req, res, next) {
    try {
      const ticket = await fieldTicketService.analyze(req.params.id, req.user._id, requestMeta(req));
      return res.success({ data: ticket, message: 'Field ticket recommendation generated successfully' });
    } catch (err) { next(err); }
  }
}

const fieldTicketController = new FieldTicketController();
export default fieldTicketController;
