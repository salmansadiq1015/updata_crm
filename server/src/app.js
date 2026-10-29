import express from 'express';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import morgan from "morgan";
import Sentry from "./config/sentry.js";

// Middleware
import { requestIdMiddleware } from './shared/middleware/requestId.js';
import { responseEnvelope } from './shared/middleware/responseEnvelope.js';
import { redactPath, requestLogger } from './shared/middleware/requestLogger.js';
import { securityHeaders } from './shared/middleware/securityHeaders.js';
import { corsMiddleware } from './shared/middleware/cors.js';
import { compressionMiddleware } from './shared/middleware/compression.js';
import { globalLimiter, agentToolLimiter, providerWebhookLimiter, gatewayLimiter, gatewayPairLimiter } from './shared/middleware/rateLimiter.js';
import { mongoSanitizeMiddleware } from './shared/utils/sanitize.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { notFoundHandler } from './shared/middleware/notFound.js';
import { setupSwagger } from "./shared/middleware/swagger.js";

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
import { deviceRouter as userDeviceRoutes } from './modules/mobile/notification.routes.js';
import timeTrackingRoutes from './modules/timeTracking/timeTracking.routes.js';
import qopRoutes from './modules/qop/qop.routes.js';
import departmentRoutes from './modules/qop/department.routes.js';
import doctplRoutes from './modules/doctpl/doctpl.routes.js';
import documentIndexRoutes from './modules/documents/documentIndex.routes.js';
import documentIngestionRoutes from './modules/documents/ingestion/ingestion.routes.js';
import vehicleRoutes from './modules/vehicles/vehicle.routes.js';
import webhookRoutes from './modules/doctpl/webhook.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import accountingRoutes from './modules/accounting/accounting.routes.js';
import tasksRoutes, { projectTaskRouter, orderTaskRouter, crossProjectRouter } from './modules/tasks/tasks.routes.js';
import taskListRoutes from './modules/tasks/taskList.routes.js';
import taskFolderRoutes from './modules/tasks/taskFolder.routes.js';
import meetingRoutes from './modules/meetings/meeting.routes.js';
import fieldTicketRoutes from './modules/fieldTickets/fieldTicket.routes.js';
import supportRoutes from './modules/support/supportTicket.routes.js';
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
import newsletterImageRoutes from './modules/crm/newsletter/newsletterImage.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import migrationRoutes from './modules/migration/migration.routes.js';
import apkRoutes from './modules/apk/apk.routes.js';
import discoveryRoutes from './modules/businessDiscovery/discovery.routes.js';
import businessDiscoveryImportRoutes from './modules/businessDiscovery/import.routes.js';
import extensionRoutes from './modules/extension/extension.routes.js';
import messagingRoutes, { messagingWebhookRoutes } from './modules/messaging/messaging.routes.js';
import aiCallingRoutes, { agentToolRoutes, aiCallingWebhookRoutes } from './modules/aiCalling/aiCalling.routes.js';
import pairedPhoneRoutes, { gatewayRoutes as pairedPhoneGatewayRoutes } from './modules/pairedPhone/pairedPhone.routes.js';
import linkAssistantRoutes from './modules/linkAssistant/linkAssistant.routes.js';
import linkAssistantPublicRoutes from './modules/linkAssistant/linkAssistant.public.routes.js';
import simSmsRoutes from './modules/simSms/simSms.routes.js';
import simCallRoutes from './modules/simCall/simCall.routes.js';
import contactPolicyRoutes from './modules/contactPolicy/contactPolicy.routes.js';
import leadGovernance, { GOVERNED_PATHS } from './modules/governance/governance.middleware.js';
import governanceRoutes from './modules/governance/governance.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';

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
  morgan.token("url", (req) => redactPath(req.originalUrl || req.url));
  app.use(morgan("dev"));
  // app.use(morgan('combined'));

  // Body parsing — 10MB for JSON, 50MB handled at multer level for files
  app.use(bodyParser.json({
    limit: "10mb",
    // LiveKit sends signed webhook JSON as application/webhook+json. Preserve
    // normal JSON handling while accepting provider-specific +json media types.
    type: ['application/json', 'application/*+json'],
    verify: (req, _res, buf) => {
      if (req.originalUrl?.startsWith('/api/v1/webhooks/email') || req.originalUrl?.startsWith('/api/v1/webhooks/messaging/') || req.originalUrl?.startsWith('/api/v1/webhooks/ai-calling/')) {
        req.rawBody = Buffer.from(buf);
      }
    },
  }));
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

  // Global rate limiting — skip Socket.IO polling (it would hit 100 req/min instantly)
  app.use((req, res, next) => {
    if (req.path.startsWith('/socket.io')) return next();
    // AI-calling worker + provider webhooks have dedicated limiters (mounted below).
    if (req.path.startsWith('/api/v1/ai-calling/agent/') || req.path.startsWith('/api/v1/webhooks/ai-calling/')) return next();
    // The paired-phone gateway has its own per-device limiter (mounted below).
    if (req.path.startsWith('/api/v1/paired-phone/gateway/')) return next();
    // The SMS link assistant's public page has its own per-IP / per-link limiters.
    if (req.path.startsWith('/c/')) return next();
    return globalLimiter(req, res, next);
  });

  // Static files (preserve existing behavior)
  app.use("/uploads", express.static("uploads"));

  // --- Routes ---

  // Root status endpoint (no auth)
  app.get("/", (req, res) => {
    res.success({
      service: "updata-api",
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
  // Lead data governance (team scope, PII masking, break-glass audit) — no-op by default.
  app.use(GOVERNED_PATHS, leadGovernance());
  app.use("/api/v1/governance", governanceRoutes);
  app.use("/api/v1/analytics", analyticsRoutes);
  app.use("/api/v1/crm", crmRoutes);
  app.use("/api/v1/messaging", messagingRoutes);
  app.use("/api/v1/webhooks/messaging", messagingWebhookRoutes);
  app.use("/api/v1/ai-calling", aiCallingRoutes);
  app.use("/api/v1/link-assistant", linkAssistantRoutes);
  // SMS link assistant customer page (public, token-authorised): https://<host>/c/<token>
  app.use("/c", linkAssistantPublicRoutes);
  app.use("/api/v1/ai-calling/agent", agentToolLimiter, agentToolRoutes);
  app.use("/api/v1/webhooks/ai-calling", providerWebhookLimiter, aiCallingWebhookRoutes);
  // Paired-phone calling (owner's phone via the ESP32 Bluetooth gateway): owner API + gateway API.
  app.use("/api/v1/paired-phone/gateway/pair", gatewayPairLimiter);
  app.use("/api/v1/paired-phone/gateway", gatewayLimiter, pairedPhoneGatewayRoutes);
  app.use("/api/v1/paired-phone", pairedPhoneRoutes);
  // AI SMS agent over the user's own phone SIM (Android private build).
  app.use("/api/v1/sim-sms", simSmsRoutes);
  app.use("/api/v1/sim-calls", simCallRoutes);
  // Cross-channel contact limits (calls, SIM SMS, provider messaging).
  app.use("/api/v1/contact-policy", contactPolicyRoutes);
  // Lead Generation / Business Discovery — discovery sessions/results + lead import.
  // Two routers share the prefix (disjoint paths/methods): discovery first, then import.
  app.use("/api/v1/business-discovery", discoveryRoutes);
  app.use("/api/v1/business-discovery", businessDiscoveryImportRoutes);
  // Chrome Extension (Lead Finder) secure connect: pairing grant, status,
  // heartbeat, disconnect. Reuses auth/session/RBAC; see extension.service.js.
  app.use("/api/v1/extension", extensionRoutes);
  app.use("/api/v1/pm", pmRoutes);
  app.use("/api/v1/scheduling", deployRoutes);
  app.use("/api/v1/mobile", mobileRoutes);
  app.use("/api/v1/time-tracking", timeTrackingRoutes);
  app.use("/api/v1/qop", qopRoutes);
  app.use("/api/v1/admin/departments", departmentRoutes);
  app.use("/api/v1/doctpl", doctplRoutes);
  app.use("/api/v1/documents/ingestion", documentIngestionRoutes);
  app.use("/api/v1/documents", documentIndexRoutes);
  app.use("/api/v1/vehicles", vehicleRoutes);
  app.use("/api/v1/catalog", catalogRoutes);
  app.use("/api/v1/accounting", accountingRoutes);
  app.use("/api/v1/tasks", tasksRoutes);
  app.use("/api/v1/task-lists", taskListRoutes);
  app.use("/api/v1/task-folders", taskFolderRoutes);
  app.use("/api/v1/meetings", meetingRoutes);
  app.use("/api/v1/field-tickets", fieldTicketRoutes);
  app.use("/api/v1/support", supportRoutes);
  app.use("/api/v1/projects/:projectId/tasks", projectTaskRouter);
  app.use("/api/v1/orders/:orderId/tasks", orderTaskRouter);
  app.use("/api/v1/projects/tasks", crossProjectRouter);
  app.use("/api/v1/notifications", notificationsRoutes);
  app.use("/api/v1/users/me/notifications", notificationFeedRoutes);
  app.use(
    "/api/v1/users/me/notification-preferences",
    notificationPreferenceRoutes,
  );
  app.use("/api/v1/users/me/devices", userDeviceRoutes);
  app.use("/api/v1/admin/notification-templates", notificationTemplateRoutes);
  app.use("/api/v1/scheduled-notifications", scheduledNotificationRoutes);
  app.use("/api/v1/admin/notification-metrics", notificationMetricsRoutes);
  app.use("/api/v1/webhooks/notification", notificationWebhookRoutes);
  app.use("/api/v1/webhooks", notificationWebhookRoutes);
  app.use("/api/v1/ai", aiRoutes);
  app.use("/api/v1/admin/integrations", integrationsRoutes);
  app.use("/api/v1/public/widget", widgetPublicRoutes);
  app.use("/api/v1/public/newsletter-images", newsletterImageRoutes);
  app.use("/api/v1/users/me/calendar", calendarSyncRoutes);
  app.use("/api/v1/webhooks/email", webhookRoutes);
  app.use("/api/v1/files", fileRoutes);
  app.use("/api/v1/dashboard", dashboardRoutes);
  app.use("/api/v1/system", systemRoutes);
  app.use("/api/v1/chat", chatRoutes);
  app.use("/api/v1/admin/migration", migrationRoutes);
  app.use("/api/v1/admin/apk", apkRoutes);

  // --- Swagger API docs (non-production or explicitly enabled) ---
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_SWAGGER === "true"
  ) {
    setupSwagger(app);
  }

  // --- Post-route middleware ---

  // Sentry error handler captures exceptions before our error handler responds
  if (Sentry) {
    Sentry.setupExpressErrorHandler(app);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
