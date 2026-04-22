import express from 'express';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import morgan from "morgan";

// Middleware
import { requestIdMiddleware } from './shared/middleware/requestId.js';
import { responseEnvelope } from './shared/middleware/responseEnvelope.js';
import { requestLogger } from './shared/middleware/requestLogger.js';
import { securityHeaders } from './shared/middleware/securityHeaders.js';
import { corsMiddleware } from './shared/middleware/cors.js';
import { compressionMiddleware } from './shared/middleware/compression.js';
import { globalLimiter } from './shared/middleware/rateLimiter.js';
import { mongoSanitizeMiddleware } from './shared/utils/sanitize.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { notFoundHandler } from './shared/middleware/notFound.js';

// Routes
import healthRoutes from './modules/health/health.routes.js';
import fileRoutes from './modules/files/file.routes.js';
import systemRoutes from './modules/system/system.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/auth/user.routes.js';
import roleRoutes, { permissionRouter } from './modules/auth/role.routes.js';
import crmRoutes from './modules/crm/crm.routes.js';
import pmRoutes from './modules/pm/pm.routes.js';
import deployRoutes from './modules/deploy/deploy.routes.js';
import mobileRoutes from './modules/mobile/mobile.routes.js';
import qopRoutes from './modules/qop/qop.routes.js';
import doctplRoutes from './modules/doctpl/doctpl.routes.js';
import webhookRoutes from './modules/doctpl/webhook.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import accountingRoutes from './modules/accounting/accounting.routes.js';
import tasksRoutes, { projectTaskRouter, orderTaskRouter, crossProjectRouter } from './modules/tasks/tasks.routes.js';
import taskListRoutes from './modules/tasks/taskList.routes.js';
import notificationsRoutes, {
  notificationFeedRoutes,
  notificationPreferenceRoutes,
  notificationTemplateRoutes,
  scheduledNotificationRoutes,
  notificationMetricsRoutes,
  notificationWebhookRoutes,
} from './modules/notifications/notifications.routes.js';
import integrationsRoutes, { calendarSyncRoutes } from './modules/integrations/integrations.routes.js';
import widgetPublicRoutes from './modules/integrations/widgetPublic.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';

// Metrics
import { metricsMiddleware, metricsEndpoint } from './metrics/index.js';

/**
 * Express app factory.
 *
 * Middleware pipeline order is CRITICAL:
 */

export function createApp() {
  const app = express();

  // --- Trust proxy (for correct IP behind LB) ---
  app.set("trust proxy", 1);

  // --- Pre-route middleware ---
  app.use(requestIdMiddleware);
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(compressionMiddleware);

  // Logging
  app.use(morgan("dev"));
  // app.use(morgan('combined'));

  // Body parsing — 10MB for JSON, 50MB handled at multer level for files
  app.use(bodyParser.json({ limit: "10mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
  app.use(cookieParser());

  // NoSQL injection prevention
  app.use(mongoSanitizeMiddleware);

  // Response helpers (res.success, res.fail)
  app.use(responseEnvelope);

  // Prometheus metrics collection
  app.use(metricsMiddleware);

  // Structured request logging (skips health endpoints)
  app.use(requestLogger);

  // Global rate limiting
  app.use(globalLimiter);

  // Static files (preserve existing behavior)
  app.use("/uploads", express.static("uploads"));

  // --- Routes ---

  // Root status endpoint (no auth)
  app.get("/", (req, res) => {
    res.success({
      service: "mb-boiler-api",
      status: "running",
      version: process.env.npm_package_version || "1.0.0",
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
    });
  });

  // Health probes (no auth, no rate limit)
  app.use("/health", healthRoutes);

  // Metrics endpoint (internal network only in production)
  app.get("/metrics", metricsEndpoint);

  // API v1 routes
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/users", userRoutes);
  app.use("/api/v1/roles", roleRoutes);
  app.use("/api/v1/permissions", permissionRouter);
  app.use("/api/v1/crm", crmRoutes);
  app.use("/api/v1/pm", pmRoutes);
  app.use("/api/v1/scheduling", deployRoutes);
  app.use("/api/v1/mobile", mobileRoutes);
  app.use("/api/v1/qop", qopRoutes);
  app.use("/api/v1/doctpl", doctplRoutes);
  app.use("/api/v1/catalog", catalogRoutes);
  app.use("/api/v1/accounting", accountingRoutes);
  app.use("/api/v1/tasks", tasksRoutes);
  app.use("/api/v1/task-lists", taskListRoutes);
  app.use("/api/v1/projects/:projectId/tasks", projectTaskRouter);
  app.use("/api/v1/orders/:orderId/tasks", orderTaskRouter);
  app.use("/api/v1/projects/tasks", crossProjectRouter);
  app.use("/api/v1/notifications", notificationsRoutes);
  app.use("/api/v1/users/me/notifications", notificationFeedRoutes);
  app.use(
    "/api/v1/users/me/notification-preferences",
    notificationPreferenceRoutes,
  );
  app.use("/api/v1/admin/notification-templates", notificationTemplateRoutes);
  app.use("/api/v1/scheduled-notifications", scheduledNotificationRoutes);
  app.use("/api/v1/admin/notification-metrics", notificationMetricsRoutes);
  app.use("/api/v1/webhooks/notification", notificationWebhookRoutes);
  app.use("/api/v1/ai", aiRoutes);
  app.use("/api/v1/admin/integrations", integrationsRoutes);
  app.use("/api/v1/public/widget", widgetPublicRoutes);
  app.use("/api/v1/users/me/calendar", calendarSyncRoutes);
  app.use("/api/v1/webhooks/email", webhookRoutes);
  app.use("/api/v1/files", fileRoutes);
  app.use("/api/v1/system", systemRoutes);

  // --- Post-route middleware ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
