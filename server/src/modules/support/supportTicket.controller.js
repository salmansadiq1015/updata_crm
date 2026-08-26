import supportTicketService from './supportTicket.service.js';
import fileService from '../files/file.service.js';

class SupportTicketController {
  async list(req, res, next) {
    try {
      const result = await supportTicketService.list(req._validatedQuery || req.query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async myTickets(req, res, next) {
    try {
      const result = await supportTicketService.myTickets(req.user._id, req._validatedQuery || req.query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async stats(req, res, next) {
    try {
      const data = await supportTicketService.stats();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const ticket = await supportTicketService.getById(req.params.id);
      return res.success({ data: ticket });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const ticket = await supportTicketService.create(req.body, req.user._id);

      // If a file was uploaded via multer, attach it to the ticket
      if (req.file) {
        const uploaded = await fileService.upload({
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          module: 'support',
          entityType: 'supportTicket',
          entityId: ticket._id,
          uploadedBy: req.user._id,
        });
        const attachment = {
          fileId: uploaded._id,
          url: uploaded.url,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          uploadedBy: req.user._id,
        };
        ticket.attachments.push(attachment);
        await ticket.save();
      }

      return res.success({ data: ticket, message: 'Support ticket created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const ticket = await supportTicketService.update(req.params.id, req.body, req.user._id);
      return res.success({ data: ticket, message: 'Support ticket updated successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const ticket = await supportTicketService.remove(req.params.id, req.user._id);
      return res.success({ data: ticket, message: 'Support ticket deleted successfully' });
    } catch (err) { next(err); }
  }
}

const supportTicketController = new SupportTicketController();
export default supportTicketController;
