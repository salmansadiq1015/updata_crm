import fieldTicketService from '../fieldTickets/fieldTicket.service.js';

function requestMeta(req) {
  return { ipAddress: req.ip, userAgent: req.get('user-agent') };
}

function scope(req) {
  return { scopeUserId: req.user._id };
}

class MobileTicketController {
  async list(req, res, next) {
    try {
      const result = await fieldTicketService.list(req._validatedQuery || req.query, scope(req));
      return res.success({ data: result, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const payload = {
        ...req.body,
        assignedTo: req.body.assignedTo || req.user._id,
      };
      const ticket = await fieldTicketService.create(payload, req.user._id, requestMeta(req));
      return res.success({ data: ticket, message: 'Ticket created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const ticket = await fieldTicketService.getById(req.params.id, scope(req));
      return res.success({ data: ticket });
    } catch (err) { next(err); }
  }

  async changeStatus(req, res, next) {
    try {
      const ticket = await fieldTicketService.changeStatus(req.params.id, req.body.status, req.user._id, requestMeta(req), scope(req));
      return res.success({ data: ticket, message: 'Ticket status updated successfully' });
    } catch (err) { next(err); }
  }

  async addComment(req, res, next) {
    try {
      const ticket = await fieldTicketService.addComment(req.params.id, req.body, req.user._id, requestMeta(req), scope(req));
      return res.success({ data: ticket, message: 'Ticket comment added successfully' });
    } catch (err) { next(err); }
  }

  async addAttachment(req, res, next) {
    try {
      const ticket = await fieldTicketService.addAttachment(req.params.id, req.body, req.user._id, requestMeta(req), scope(req));
      return res.success({ data: ticket, message: 'Ticket attachment added successfully' });
    } catch (err) { next(err); }
  }
}

const mobileTicketController = new MobileTicketController();
export default mobileTicketController;
