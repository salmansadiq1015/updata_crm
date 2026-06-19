import { Router } from 'express';
import mobileTicketController from './ticket.controller.js';
import { requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import {
  addTicketAttachmentSchema,
  addTicketCommentSchema,
  changeTicketStatusSchema,
  createTicketSchema,
  listTicketsSchema,
  ticketIdParamSchema,
} from '../fieldTickets/fieldTicket.validation.js';

const router = Router();

router.get('/', requirePermission('mobile:read'), validate(listTicketsSchema), (req, res, next) => mobileTicketController.list(req, res, next));
router.post('/', requirePermission('mobile:write'), validate(createTicketSchema), (req, res, next) => mobileTicketController.create(req, res, next));
router.get('/:id', requirePermission('mobile:read'), validate(ticketIdParamSchema), (req, res, next) => mobileTicketController.getById(req, res, next));
router.patch('/:id/status', requirePermission('mobile:write'), validate(changeTicketStatusSchema), (req, res, next) => mobileTicketController.changeStatus(req, res, next));
router.post('/:id/comments', requirePermission('mobile:write'), validate(addTicketCommentSchema), (req, res, next) => mobileTicketController.addComment(req, res, next));
router.post('/:id/attachments', requirePermission('mobile:write'), validate(addTicketAttachmentSchema), (req, res, next) => mobileTicketController.addAttachment(req, res, next));

export default router;
