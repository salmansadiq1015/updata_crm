import { Router } from 'express';
import multer from 'multer';
import customerController from './customer.controller.js';
import noteController from './note.controller.js';
import imageController from './image.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createCustomerSchema, updateCustomerSchema, listCustomersSchema,
  searchCustomersSchema, duplicateCheckSchema, customerIdParamSchema,
  mergeCustomersSchema, undoMergeSchema, bulkUpdateCustomersSchema, bulkDeleteCustomersSchema,
  exportCustomersSchema, customerActivitySchema,
} from './customer.validation.js';
import { createNoteSchema } from './note.validation.js';
import { createImageSchema } from './image.validation.js';
import attachmentController from './attachment.controller.js';
import {
  listAttachmentsSchema,
  uploadAttachmentSchema,
  renameAttachmentSchema,
  deleteAttachmentSchema,
  bulkDeleteAttachmentSchema,
} from './attachment.validation.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});
const setCustomerEntity = (req, res, next) => { req.entityType = 'customer'; next(); };

// Named routes BEFORE /:id

/**
 * @swagger
 * /crm/customers/search:
 *   get:
 *     tags: [CRM - Customers]
 *     summary: Full-text search across customers
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Matching customers
 *       401:
 *         description: Not authenticated
 */
router.get('/search', authenticate, requirePermission('crm:read'), validate(searchCustomersSchema), (req, res, next) => customerController.search(req, res, next));
router.get('/duplicates', authenticate, requirePermission('crm:read'), validate(duplicateCheckSchema), (req, res, next) => customerController.checkDuplicates(req, res, next));

/**
 * @swagger
 * /crm/customers/export:
 *   get:
 *     tags: [CRM - Customers]
 *     summary: Export customers as CSV
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/export', authenticate, requirePermission('crm:read'), validate(exportCustomersSchema), (req, res, next) => customerController.exportCsv(req, res, next));
router.get('/cleanup-audit', authenticate, requirePermission('crm:admin'), (req, res, next) => customerController.cleanupAudit(req, res, next));
router.patch('/bulk-update', authenticate, requirePermission('crm:admin'), validate(bulkUpdateCustomersSchema), (req, res, next) => customerController.bulkUpdate(req, res, next));
router.post('/bulk-delete', authenticate, requirePermission('crm:admin'), validate(bulkDeleteCustomersSchema), (req, res, next) => customerController.bulkDeactivate(req, res, next));
// Merging duplicates and reversing a merge are key-user operations, gated on
// their own permission so they can be granted without full crm:admin.
// Registered before /:id so "merges" is not read as a customer id.
router.post('/merge', authenticate, requirePermission('crm:merge'), validate(mergeCustomersSchema), (req, res, next) => customerController.merge(req, res, next));
router.get('/merges', authenticate, requirePermission('crm:merge'), (req, res, next) => customerController.listMerges(req, res, next));
router.post('/merges/:mergeId/undo', authenticate, requirePermission('crm:merge'), validate(undoMergeSchema), (req, res, next) => customerController.undoMerge(req, res, next));

// Standard CRUD

/**
 * @swagger
 * /crm/customers:
 *   get:
 *     tags: [CRM - Customers]
 *     summary: List customers with pagination and filtering
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, archived]
 *     responses:
 *       200:
 *         description: Paginated list of customers
 *       401:
 *         description: Not authenticated
 *   post:
 *     tags: [CRM - Customers]
 *     summary: Create a new customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [company, individual]
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Customer created
 *       400:
 *         description: Validation error
 */
router.get('/', authenticate, requirePermission('crm:read'), validate(listCustomersSchema), (req, res, next) => customerController.list(req, res, next));
router.post('/', authenticate, requirePermission('crm:write'), validate(createCustomerSchema), (req, res, next) => customerController.create(req, res, next));

/**
 * @swagger
 * /crm/customers/{id}:
 *   get:
 *     tags: [CRM - Customers]
 *     summary: Get a customer by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer details
 *       404:
 *         description: Customer not found
 *   patch:
 *     tags: [CRM - Customers]
 *     summary: Update a customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Customer updated
 *       404:
 *         description: Customer not found
 */
router.get('/:id', authenticate, requirePermission('crm:read'), validate(customerIdParamSchema), (req, res, next) => customerController.getById(req, res, next));
router.get('/:id/activity', authenticate, requirePermission('crm:read'), validate(customerActivitySchema), (req, res, next) => customerController.getActivity(req, res, next));
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateCustomerSchema), (req, res, next) => customerController.update(req, res, next));

/**
 * @swagger
 * /crm/customers/{id}/deactivate:
 *   post:
 *     tags: [CRM - Customers]
 *     summary: Deactivate a customer (reversible — customers are never archived away)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer deactivated
 *       404:
 *         description: Customer not found
 */
router.post('/:id/deactivate', authenticate, requirePermission('crm:delete'), validate(customerIdParamSchema), (req, res, next) => customerController.deactivate(req, res, next));

/**
 * @swagger
 * /crm/customers/{id}/reactivate:
 *   post:
 *     tags: [CRM - Customers]
 *     summary: Reactivate a deactivated customer
 *     responses:
 *       200:
 *         description: Customer reactivated
 *       409:
 *         description: Already active, or merged into another customer
 */
router.post('/:id/reactivate', authenticate, requirePermission('crm:delete'), validate(customerIdParamSchema), (req, res, next) => customerController.reactivate(req, res, next));

// Notes sub-routes
router.get('/:id/notes', authenticate, requirePermission('crm:read'), setCustomerEntity, (req, res, next) => noteController.listByEntity(req, res, next));
router.post('/:id/notes', authenticate, requirePermission('crm:write'), setCustomerEntity, validate(createNoteSchema), (req, res, next) => noteController.create(req, res, next));

// Images sub-routes
router.get('/:id/images', authenticate, requirePermission('crm:read'), setCustomerEntity, (req, res, next) => imageController.listByEntity(req, res, next));
router.post('/:id/images', authenticate, requirePermission('crm:write'), setCustomerEntity, upload.single('image'), validate(createImageSchema), (req, res, next) => imageController.create(req, res, next));

// Attachment sub-routes — bulk-delete registered BEFORE /:fileId to avoid param collision
router.get('/:id/attachments', authenticate, requirePermission('crm:read'), validate(listAttachmentsSchema), (req, res, next) => attachmentController.list(req, res, next));
router.post('/:id/attachments', authenticate, requirePermission('crm:write'), uploadAttachment.single('file'), validate(uploadAttachmentSchema), (req, res, next) => attachmentController.upload(req, res, next));
router.post('/:id/attachments/bulk-delete', authenticate, requirePermission('crm:delete'), validate(bulkDeleteAttachmentSchema), (req, res, next) => attachmentController.bulkRemove(req, res, next));
router.patch('/:id/attachments/:fileId', authenticate, requirePermission('crm:write'), validate(renameAttachmentSchema), (req, res, next) => attachmentController.rename(req, res, next));
router.delete('/:id/attachments/:fileId', authenticate, requirePermission('crm:delete'), validate(deleteAttachmentSchema), (req, res, next) => attachmentController.remove(req, res, next));

export default router;
