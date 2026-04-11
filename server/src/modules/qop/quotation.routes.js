import { Router } from 'express';
import quotationController from './quotation.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createQuotationSchema, updateQuotationSchema, listQuotationsSchema,
  quotationIdParamSchema, duplicateSchema, transitionStatusSchema,
  sendSchema, convertSchema, snoozeReminderSchema,
} from './quotation.validation.js';

const router = Router();

// Collection routes BEFORE /:id
router.post('/', authenticate, requirePermission('quotations:write'), validate(createQuotationSchema), (req, res, next) => quotationController.create(req, res, next));
router.get('/', authenticate, requirePermission('quotations:read'), validate(listQuotationsSchema), (req, res, next) => quotationController.list(req, res, next));

// Single-resource routes
router.get('/:id', authenticate, requirePermission('quotations:read'), validate(quotationIdParamSchema), (req, res, next) => quotationController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('quotations:write'), validate(updateQuotationSchema), (req, res, next) => quotationController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('quotations:delete'), validate(quotationIdParamSchema), (req, res, next) => quotationController.delete(req, res, next));

// Actions
router.post('/:id/duplicate', authenticate, requirePermission('quotations:write'), validate(duplicateSchema), (req, res, next) => quotationController.duplicate(req, res, next));
router.patch('/:id/status', authenticate, requirePermission('quotations:write'), validate(transitionStatusSchema), (req, res, next) => quotationController.transitionStatus(req, res, next));
router.post('/:id/send', authenticate, requirePermission('quotations:write'), validate(sendSchema), (req, res, next) => quotationController.send(req, res, next));
router.post('/:id/convert', authenticate, requirePermission('quotations:write'), validate(convertSchema), (req, res, next) => quotationController.convert(req, res, next));

// Documents
router.get('/:id/documents', authenticate, requirePermission('quotations:read'), validate(quotationIdParamSchema), (req, res, next) => quotationController.getDocuments(req, res, next));
router.post('/:id/documents/generate', authenticate, requirePermission('quotations:write'), validate(quotationIdParamSchema), (req, res, next) => quotationController.generateDocument(req, res, next));

// History
router.get('/:id/history', authenticate, requirePermission('quotations:read'), validate(quotationIdParamSchema), (req, res, next) => quotationController.getHistory(req, res, next));

// Reminders
router.post('/:id/reminders/:remId/snooze', authenticate, requirePermission('quotations:write'), validate(snoozeReminderSchema), (req, res, next) => quotationController.snoozeReminder(req, res, next));

export default router;
