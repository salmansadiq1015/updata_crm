import { Router } from 'express';
import integrationAdminRoutes from './integrationAdmin.routes.js';
import widgetAdminRoutes from './widgetAdmin.routes.js';
import calendarSyncRoutes from './calendarSync.routes.js';

const router = Router();

// Admin integration management
router.use('/', integrationAdminRoutes);

// Widget admin management
router.use('/widget', widgetAdminRoutes);

export { calendarSyncRoutes };
export default router;
