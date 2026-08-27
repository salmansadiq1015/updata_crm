import { Router } from 'express';
import apkController from './apk.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';

const router = Router();

router.get('/', authenticate, (req, res, next) => apkController.getInfo(req, res, next));
router.post('/upload-credentials', authenticate, requirePermission('settings:admin'), (req, res, next) => apkController.getUploadCredentials(req, res, next));

export default router;
