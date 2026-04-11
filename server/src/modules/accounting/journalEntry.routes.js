import { Router } from 'express';
import journalEntryController from './journalEntry.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createJournalSchema, journalIdParamSchema, listJournalSchema,
  reverseJournalSchema, exportJournalSchema,
} from './journalEntry.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:journal:read'), validate(listJournalSchema), (req, res, next) => journalEntryController.list(req, res, next));
router.post('/', authenticate, requirePermission('accounting:journal:write'), validate(createJournalSchema), (req, res, next) => journalEntryController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:journal:read'), validate(journalIdParamSchema), (req, res, next) => journalEntryController.getById(req, res, next));
router.post('/:id/reverse', authenticate, requirePermission('accounting:journal:write'), validate(reverseJournalSchema), (req, res, next) => journalEntryController.reverse(req, res, next));
router.post('/export', authenticate, requirePermission('accounting:journal:export'), validate(exportJournalSchema), (req, res, next) => journalEntryController.exportCsv(req, res, next));

export default router;
