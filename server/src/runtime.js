import { initializeSocketServer } from './shared/socket/socketServer.js';
import { createApp } from './app.js';
import { registerJobs } from './jobs/index.js';
import { registerAuthEvents } from './modules/auth/auth.events.js';
import { registerCrmEvents } from './modules/crm/crm.events.js';
import { registerPmEvents } from './modules/pm/pm.events.js';
import { registerDeployEvents } from './modules/deploy/deploy.events.js';
import { registerMobileEvents } from './modules/mobile/mobile.events.js';
import { registerQopEvents } from './modules/qop/qop.events.js';
import { registerDoctplEvents } from './modules/doctpl/doctpl.events.js';
import { registerCatalogEvents } from './modules/catalog/catalog.events.js';
import { registerAccountingEvents } from './modules/accounting/accounting.events.js';
import { registerTasksEvents } from './modules/tasks/tasks.events.js';
import { registerMeetingEvents } from './modules/meetings/meeting.events.js';
import { registerNotificationsEvents } from './modules/notifications/notifications.events.js';
import { registerIntegrationsEvents } from './modules/integrations/integrations.events.js';
import { registerAiEvents } from './modules/ai/ai.events.js';
import { registerAgentHandoffs } from './modules/ai/governance/agentHandoffs.js';
import { registerDiscoverySocket } from './modules/businessDiscovery/discovery.events.js';

// Imported after seed data is ready so unrelated models do not queue their
// collection/index initialization ahead of bootstrap queries.
export function registerEventHandlers() {
  registerAuthEvents();
  registerCrmEvents();
  registerPmEvents();
  registerDeployEvents();
  registerMobileEvents();
  registerQopEvents();
  registerDoctplEvents();
  registerCatalogEvents();
  registerAccountingEvents();
  registerTasksEvents();
  registerMeetingEvents();
  registerNotificationsEvents();
  registerIntegrationsEvents();
  registerAiEvents();
  registerAgentHandoffs();
}

export { createApp, registerJobs, initializeSocketServer, registerDiscoverySocket };
