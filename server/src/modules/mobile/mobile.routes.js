import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import orderRoutes from './order.routes.js';
import { reportOrderRouter, reportRouter } from './report.routes.js';
import { photoOrderRouter, photoRouter } from './photo.routes.js';
import { timeEntryOrderRouter, timeEntryRouter } from './timeEntry.routes.js';
import documentRoutes from './document.routes.js';
import catalogRoutes from './catalog.routes.js';
import { chatProjectRouter, chatRouter } from './chat.routes.js';
import smallOrderRoutes from './smallOrder.routes.js';
import { installationSiteRouter, installationRouter } from './installation.routes.js';
import { sparePartRouter, installationSparePartRouter } from './sparePart.routes.js';
import quotationRoute from './quotation.routes.js';
import syncRoutes from './sync.routes.js';
import noteRoutes from './note.routes.js';
import { deviceRouter, notificationRouter } from './notification.routes.js';

/**
 * Mobile route aggregator.
 * Mounts all mobile sub-routers under /api/v1/mobile.
 *
 * URL structure:
 *   /api/v1/mobile/orders                              — order listing
 *   /api/v1/mobile/orders/:id                           — order detail
 *   /api/v1/mobile/orders/:id/status                    — order status update
 *   /api/v1/mobile/orders/:id/reports                   — work reports (nested)
 *   /api/v1/mobile/orders/:id/photos                    — photos (nested)
 *   /api/v1/mobile/orders/:id/time-entries              — time entries (nested)
 *   /api/v1/mobile/orders/:id/documents                 — documents (nested)
 *   /api/v1/mobile/orders/:id/quotation                 — quotation (nested)
 *   /api/v1/mobile/reports/:reportId                    — report CRUD
 *   /api/v1/mobile/time-entries                         — time entry listing / CRUD
 *   /api/v1/mobile/photos/:photoId                      — photo delete
 *   /api/v1/mobile/catalog                              — catalog search, sync, favorites
 *   /api/v1/mobile/projects/:id/chat                    — project chat (nested)
 *   /api/v1/mobile/projects/:id/small-orders            — small orders (nested)
 *   /api/v1/mobile/chat/:messageId/read                 — mark message read
 *   /api/v1/mobile/sites/:siteId/installations          — installations by site
 *   /api/v1/mobile/installations/:id                    — installation detail
 *   /api/v1/mobile/sync                                 — offline sync
 *   /api/v1/mobile/notifications                        — notification listing / read
 *   /api/v1/mobile/devices                              — device registration
 */
const router = Router();

// All mobile routes require authentication
router.use(authenticate);

// --- Orders ---
router.use('/orders', orderRoutes);

// --- Nested order sub-resources ---
router.use('/orders/:id', reportOrderRouter);
router.use('/orders/:id', timeEntryOrderRouter);
router.use('/orders/:id/photos', photoOrderRouter);
router.use('/orders/:id/documents', documentRoutes);
router.use('/orders/:id/quotation', quotationRoute);

// --- Standalone entity routes ---
router.use('/reports', reportRouter);
router.use('/time-entries', timeEntryRouter);
router.use('/photos', photoRouter);

// --- Catalog ---
router.use('/catalog', catalogRoutes);

// --- Chat ---
router.use('/projects/:id/chat', chatProjectRouter);
router.use('/chat', chatRouter);

// --- Small Orders ---
router.use('/projects/:id/small-orders', smallOrderRoutes);

// --- Installations ---
router.use('/sites/:siteId/installations', installationSiteRouter);
router.use('/spare-parts', sparePartRouter);
router.use('/installations/:id/spare-parts', installationSparePartRouter);
router.use('/installations', installationRouter);
router.use('/notes', noteRoutes);

// --- Sync ---
router.use('/sync', syncRoutes);

// --- Notifications & Devices ---
router.use('/notifications', notificationRouter);
router.use('/devices', deviceRouter);

export default router;
