import { Router } from 'express';
import mongoose from 'mongoose';
import fileService from '../../files/file.service.js';
import storageService from '../../../shared/storage/StorageService.js';
import { createLimiter } from '../../../shared/middleware/rateLimiter.js';
import logger from '../../../shared/logger/index.js';

const router = Router();

const imageLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: 'Too many image requests, please try again later',
});

/**
 * GET /:fileId
 *
 * Public proxy for newsletter images stored in S3.
 * Generates a fresh presigned URL and redirects with 302.
 * Only allows files belonging to module "crm" with bucket "images".
 */
router.get('/:fileId', imageLimiter, async (req, res, next) => {
  try {
    const { fileId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    const file = await fileService.getById(fileId);

    if (!file || file.isDeleted) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Security: only allow CRM image files
    if (file.module !== 'crm' || file.bucket !== 'images') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate a short-lived presigned URL (15 min)
    const presignedUrl = await storageService.getPresignedUrl(file.key, 900);

    res.set('Cache-Control', 'public, max-age=86400');
    return res.redirect(302, presignedUrl);
  } catch (err) {
    logger.error('Newsletter image proxy failed', {
      module: 'crm',
      action: 'newsletter-image-proxy',
      fileId: req.params.fileId,
      error: { message: err.message },
    });
    return next(err);
  }
});

export default router;
