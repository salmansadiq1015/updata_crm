import { Router } from 'express';
import fieldTicketController from './fieldTicket.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import {
  addTicketAttachmentSchema,
  addTicketCommentSchema,
  assignTicketSchema,
  changeTicketStatusSchema,
  createTicketSchema,
  listTicketsSchema,
  ticketIdParamSchema,
  updateTicketSchema,
} from './fieldTicket.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('field-ticket:read'), validate(listTicketsSchema), (req, res, next) => fieldTicketController.list(req, res, next));
router.post('/', authenticate, requirePermission('field-ticket:write'), validate(createTicketSchema), (req, res, next) => fieldTicketController.create(req, res, next));
router.get('/summary', authenticate, requirePermission('field-ticket:read'), validate(listTicketsSchema), (req, res, next) => fieldTicketController.summary(req, res, next));
router.get('/:id', authenticate, requirePermission('field-ticket:read'), validate(ticketIdParamSchema), (req, res, next) => fieldTicketController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('field-ticket:write'), validate(updateTicketSchema), (req, res, next) => fieldTicketController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('field-ticket:admin'), validate(ticketIdParamSchema), (req, res, next) => fieldTicketController.remove(req, res, next));
router.patch('/:id/status', authenticate, requirePermission('field-ticket:write'), validate(changeTicketStatusSchema), (req, res, next) => fieldTicketController.changeStatus(req, res, next));
router.patch('/:id/assign', authenticate, requirePermission('field-ticket:assign'), validate(assignTicketSchema), (req, res, next) => fieldTicketController.assign(req, res, next));
router.post('/:id/comments', authenticate, requirePermission('field-ticket:comment'), validate(addTicketCommentSchema), (req, res, next) => fieldTicketController.addComment(req, res, next));
router.post('/:id/attachments', authenticate, requirePermission('field-ticket:write'), validate(addTicketAttachmentSchema), (req, res, next) => fieldTicketController.addAttachment(req, res, next));
router.get('/:id/activity', authenticate, requirePermission('field-ticket:read'), validate(ticketIdParamSchema), (req, res, next) => fieldTicketController.activity(req, res, next));
router.post('/:id/ai/analyze', authenticate, requirePermission('field-ticket:write'), validate(ticketIdParamSchema), (req, res, next) => fieldTicketController.analyze(req, res, next));

export default router;
