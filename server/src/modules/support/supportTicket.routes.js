import { Router } from 'express';
import multer from 'multer';
import supportTicketController from './supportTicket.controller.js';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import {
  createTicketSchema,
  listTicketsSchema,
  ticketIdParamSchema,
  updateTicketSchema,
} from './supportTicket.validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

const router = Router();

router.get('/', authenticate, validate(listTicketsSchema), (req, res, next) => supportTicketController.list(req, res, next));
router.get('/my-tickets', authenticate, validate(listTicketsSchema), (req, res, next) => supportTicketController.myTickets(req, res, next));
router.get('/stats', authenticate, (req, res, next) => supportTicketController.stats(req, res, next));
router.get('/:id', authenticate, validate(ticketIdParamSchema), (req, res, next) => supportTicketController.getById(req, res, next));
router.post('/', authenticate, upload.single('file'), validate(createTicketSchema), (req, res, next) => supportTicketController.create(req, res, next));
router.put('/:id', authenticate, validate(updateTicketSchema), (req, res, next) => supportTicketController.update(req, res, next));
router.delete('/:id', authenticate, validate(ticketIdParamSchema), (req, res, next) => supportTicketController.remove(req, res, next));

export default router;
