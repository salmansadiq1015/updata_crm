import { Router } from 'express';
import newsletterController from './newsletter.controller.js';
import { validate } from '../../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../../shared/middleware/authenticate.js';
import {
  createNewsletterSchema,
  updateNewsletterSchema,
  listNewslettersSchema,
  newsletterIdParamSchema,
  scheduleNewsletterSchema,
  countRecipientsSchema,
} from './newsletter.validation.js';

const router = Router();

// All routes require authentication and crm:admin permission
router.use(authenticate, requirePermission('crm:admin'));

// Recipient count preview (before /:id routes)
router.post(
  '/count-recipients',
  validate(countRecipientsSchema),
  (req, res, next) => newsletterController.countRecipients(req, res, next),
);

// List & Create
router.get(
  '/',
  validate(listNewslettersSchema),
  (req, res, next) => newsletterController.list(req, res, next),
);

router.post(
  '/',
  validate(createNewsletterSchema),
  (req, res, next) => newsletterController.create(req, res, next),
);

// Single newsletter CRUD
router.get(
  '/:id',
  validate(newsletterIdParamSchema),
  (req, res, next) => newsletterController.getById(req, res, next),
);

router.patch(
  '/:id',
  validate(updateNewsletterSchema),
  (req, res, next) => newsletterController.update(req, res, next),
);

router.delete(
  '/:id',
  validate(newsletterIdParamSchema),
  (req, res, next) => newsletterController.delete(req, res, next),
);

// Actions
router.post(
  '/:id/schedule',
  validate(scheduleNewsletterSchema),
  (req, res, next) => newsletterController.schedule(req, res, next),
);

router.post(
  '/:id/cancel',
  validate(newsletterIdParamSchema),
  (req, res, next) => newsletterController.cancel(req, res, next),
);

router.post(
  '/:id/send',
  validate(newsletterIdParamSchema),
  (req, res, next) => newsletterController.send(req, res, next),
);

// Stats
router.get(
  '/:id/stats',
  validate(newsletterIdParamSchema),
  (req, res, next) => newsletterController.getStats(req, res, next),
);

export default router;
