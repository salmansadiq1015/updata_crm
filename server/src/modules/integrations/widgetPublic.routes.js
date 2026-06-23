import { Router } from 'express';
import multer from 'multer';
import widgetPublicController from './widgetPublic.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { createLimiter } from '../../shared/middleware/rateLimiter.js';
import {
  submitWidgetSchema,
  submissionIdParamSchema,
  widgetIdQuerySchema,
} from './widgetPublic.validation.js';

const router = Router();

const widgetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many widget submissions, please try again later',
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only JPEG and PNG image uploads are accepted'));
  },
});

router.get('/config', widgetLimiter, validate(widgetIdQuerySchema), (req, res, next) => widgetPublicController.getConfig(req, res, next));
router.post('/submissions', widgetLimiter, validate(submitWidgetSchema), (req, res, next) => widgetPublicController.submit(req, res, next));
router.post('/submissions/:submissionId/attachments', widgetLimiter, upload.single('file'), validate(submissionIdParamSchema), (req, res, next) => widgetPublicController.uploadAttachment(req, res, next));

export default router;
