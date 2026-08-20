import { Router } from 'express';
import calendarRoutes from './calendar.routes.js';
import coarseRoutes from './coarse.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import employeeRoutes from './employee.routes.js';
import workTypeRoutes from './workType.routes.js';
import mobileRoutes from './mobile.routes.js';

/**
 * Deploy route aggregator.
 * Mounts all deploy sub-routers under /api/v1/deploy.
 *
 * URL structure:
 *   /api/v1/deploy/calendar          — calendar data
 *   /api/v1/deploy/assignments       — assignment CRUD
 *   /api/v1/deploy/assignments/:id/appointment — appointment details (nested)
 *   /api/v1/deploy/conflicts         — conflict records
 *   /api/v1/deploy/dashboard         — dashboard summary, utilization, alerts
 *   /api/v1/deploy/coarse            — coarse allocation matrix
 *   /api/v1/deploy/mobile            — mobile endpoints
 */
const router = Router();

// --- Calendar ---
router.use('/calendar', calendarRoutes);

// --- Schedule-aware employees ---
router.use('/employees', employeeRoutes);
router.use('/work-types', workTypeRoutes);

// --- Assignments ---
// Lazy import: assignment routes may not exist yet
try {
  const { default: assignmentRoutes } = await import('./assignment.routes.js');
  router.use('/assignments', assignmentRoutes);
} catch {
  // assignment.routes.js not yet created — skip
}

// --- Appointment (nested under assignments) ---
try {
  const { default: appointmentRoutes } = await import('./appointment.routes.js');
  const appointmentRouter = Router({ mergeParams: true });
  appointmentRouter.use('/', appointmentRoutes);
  router.use('/assignments/:id/appointment', appointmentRouter);
} catch {
  // appointment.routes.js not yet created — skip
}

// --- Conflicts ---
try {
  const { default: conflictRoutes } = await import('./conflict.routes.js');
  router.use('/conflicts', conflictRoutes);
} catch {
  // conflict.routes.js not yet created — skip
}

// --- Dashboard ---
router.use('/dashboard', dashboardRoutes);

// --- Coarse ---
router.use('/coarse', coarseRoutes);

// --- Mobile ---
router.use('/mobile', mobileRoutes);

export default router;
