import { Router } from 'express';
import templateRoutes from './template.routes.js';
import documentRoutes from './document.routes.js';
import ciRoutes from './ci.routes.js';
import emailRoutes from './email.routes.js';
import emailTemplateRoutes from './emailTemplate.routes.js';

/**
 * DocTpl route aggregator.
 * Mounts all doctpl sub-routers under /api/v1/doctpl.
 *
 * URL structure:
 *   /api/v1/doctpl/templates        — document template CRUD + versions + preview
 *   /api/v1/doctpl/documents        — generated document operations
 *   /api/v1/doctpl/ci               — CI configuration + assets
 *   /api/v1/doctpl/emails           — email sending, composing, listing, retry
 *   /api/v1/doctpl/email-templates  — email body template management
 */
const router = Router();

router.use('/templates', templateRoutes);
router.use('/documents', documentRoutes);
router.use('/ci', ciRoutes);
router.use('/emails', emailRoutes);
router.use('/email-templates', emailTemplateRoutes);

export default router;
