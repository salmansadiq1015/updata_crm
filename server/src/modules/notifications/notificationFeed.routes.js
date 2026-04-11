import { Router } from 'express';
import notificationFeedController from './notificationFeed.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  getFeedSchema,
  feedIdParamSchema,
} from './notificationFeed.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('notifications:feed'), validate(getFeedSchema), (req, res, next) => notificationFeedController.getFeed(req, res, next));
router.get('/unread-count', authenticate, requirePermission('notifications:feed'), (req, res, next) => notificationFeedController.getUnreadCount(req, res, next));
router.patch('/:id/read', authenticate, requirePermission('notifications:feed'), validate(feedIdParamSchema), (req, res, next) => notificationFeedController.markRead(req, res, next));
router.post('/mark-all-read', authenticate, requirePermission('notifications:feed'), (req, res, next) => notificationFeedController.markAllRead(req, res, next));
router.delete('/:id', authenticate, requirePermission('notifications:feed'), validate(feedIdParamSchema), (req, res, next) => notificationFeedController.dismiss(req, res, next));

export default router;
