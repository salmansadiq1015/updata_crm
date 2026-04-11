import { Router } from 'express';
import multer from 'multer';
import taskAttachmentController from './taskAttachment.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listAttachmentsSchema, uploadAttachmentSchema, downloadAttachmentSchema, deleteAttachmentSchema,
} from './taskAttachment.validation.js';
import { MAX_FILE_SIZE } from './taskAttachment.model.js';

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

router.get('/', authenticate, requirePermission('tasks:manage'), validate(listAttachmentsSchema), (req, res, next) => taskAttachmentController.list(req, res, next));
router.post('/', authenticate, requirePermission('tasks:manage'), upload.single('file'), validate(uploadAttachmentSchema), (req, res, next) => taskAttachmentController.upload(req, res, next));
router.get('/:attachmentId/download', authenticate, requirePermission('tasks:manage'), validate(downloadAttachmentSchema), (req, res, next) => taskAttachmentController.download(req, res, next));
router.delete('/:attachmentId', authenticate, requirePermission('tasks:manage'), validate(deleteAttachmentSchema), (req, res, next) => taskAttachmentController.remove(req, res, next));

export default router;
