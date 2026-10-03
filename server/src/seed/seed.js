import { seedCatalog } from './catalog-seed.js';
import { seedDoctplTemplates } from './doctplSeed.js';
import { seedOperations } from './operations-seed.js';
import { seedAgentRegistry } from './agentRegistrySeed.js';
import { seedProjectTaskTemplates } from './projectTaskTemplateSeed.js';
import { seedAiVocabulary } from './ai-vocabulary-seed.js';
import { seedAiCommands } from './ai-commands-seed.js';
import Permission from '../modules/auth/permission.model.js';
import Role from '../modules/auth/role.model.js';
import User from '../modules/auth/user.model.js';
import PasswordHistory from '../modules/auth/passwordHistory.model.js';
import Department from '../modules/qop/department.model.js';
import Vehicle from '../modules/vehicles/vehicle.model.js';
import VehicleServiceEntry from '../modules/vehicles/vehicleServiceEntry.model.js';
import VehicleMaterial from '../modules/vehicles/vehicleMaterial.model.js';
import VehicleNote from '../modules/vehicles/vehicleNote.model.js';
import Customer from '../modules/crm/customer.model.js';
import Site from '../modules/crm/site.model.js';
import crmCounter from '../modules/crm/counter.service.js';
import { hashPassword } from '../shared/utils/crypto.js';
import cacheManager from '../shared/cache/CacheManager.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

/**
 * Seed permissions, roles, and initial admin user.
 *
 * Idempotent: upserts permissions on every run so new entries added to
 * PERMISSION_DEFINITIONS are created in existing databases automatically.
 * Roles are created if missing; Admin role is always synced to all permissions.
 * Other roles receive new permissions via $addToSet (never removes existing ones).
 */

// All permission definitions: { module, action, description }
export const ACCOUNTING_PERMISSION_KEYS = [
  'accounting:read',
  'accounting:write',
  'accounting:admin',
  'accounting:chart:read',
  'accounting:chart:manage',
  'accounting:journal:read',
  'accounting:journal:write',
  'accounting:journal:export',
  'accounting:ar:read',
  'accounting:ar:manage',
  'accounting:ar:dunning',
  'accounting:ap:read',
  'accounting:ap:manage',
  'accounting:ap:approve',
  'accounting:ap:approve_high',
  'accounting:ap:upload',
  'accounting:documents:read',
  'accounting:documents:manage',
  'accounting:bank:read',
  'accounting:bank:manage',
  'accounting:reconciliation:manage',
  'accounting:cash:read',
  'accounting:cash:manage',
  'accounting:openitems:read',
  'accounting:openitems:manage',
];

const accountingPermissionDefinitions = ACCOUNTING_PERMISSION_KEYS.map((key) => {
  const [module, ...actionParts] = key.split(':');
  return {
    module,
    action: actionParts.join(':'),
    description: `Accounting permission: ${key}`,
  };
});

export const PERMISSION_DEFINITIONS = [
  // Users
  { module: 'users', action: 'read', description: 'View user profiles' },
  { module: 'users', action: 'write', description: 'Create and update users' },
  { module: 'users', action: 'admin', description: 'Full user administration' },

  // Roles
  { module: 'roles', action: 'read', description: 'View roles and permissions' },
  { module: 'roles', action: 'admin', description: 'Manage roles and permissions' },

  // Audit
  { module: 'audit', action: 'read', description: 'View audit logs' },

  // CRM
  { module: 'crm', action: 'read', description: 'View CRM data' },
  { module: 'crm', action: 'write', description: 'Create and update CRM data' },
  { module: 'crm', action: 'delete', description: 'Delete CRM data' },
  { module: 'crm', action: 'admin', description: 'Full CRM administration' },
  { module: 'crm', action: 'merge', description: 'Merge duplicate customers and undo a merge (key user)' },

  // Projects
  { module: 'projects', action: 'read', description: 'View projects' },
  { module: 'projects', action: 'write', description: 'Create and update projects' },
  { module: 'projects', action: 'delete', description: 'Delete projects' },
  { module: 'projects', action: 'admin', description: 'Full project administration' },

  // Projects — fine-grained (Phase C0)
  { module: 'project', action: 'create',              description: 'Create new projects' },
  { module: 'project', action: 'edit',                description: 'Edit project details' },
  { module: 'project', action: 'read',                description: 'View project details' },
  { module: 'project', action: 'delete',              description: 'Delete / soft-delete projects' },
  { module: 'project', action: 'status:update',       description: 'Transition project status through allowed flow' },
  { module: 'project', action: 'status:override',     description: 'Override project status transition rules' },
  { module: 'project', action: 'prep-actions:manage', description: 'Create, update, and delete preparatory actions' },
  { module: 'project', action: 'schedule:manage',     description: 'Create, update, and delete schedule entries' },
  { module: 'project', action: 'documents:read',      description: 'View project documents' },
  { module: 'project', action: 'documents:write',     description: 'Upload and update project documents' },
  { module: 'project', action: 'documents:create',    description: 'Generate project documents from templates' },
  { module: 'project', action: 'documents:delete',    description: 'Delete project documents' },
  { module: 'project', action: 'documents:read:all', description: 'View every project document, including those not released to the field' },

  // Field Service
  { module: 'field-service', action: 'read', description: 'View field service data' },
  { module: 'field-service', action: 'write', description: 'Create and update field service data' },
  { module: 'field-service', action: 'admin', description: 'Full field service administration' },

  // Field tickets / technician incidents
  { module: 'field-ticket', action: 'read', description: 'View technician tickets and incident history' },
  { module: 'field-ticket', action: 'write', description: 'Create and update technician tickets' },
  { module: 'field-ticket', action: 'assign', description: 'Assign technician tickets to users or teams' },
  { module: 'field-ticket', action: 'comment', description: 'Add internal ticket comments and status updates' },
  { module: 'field-ticket', action: 'admin', description: 'Delete and administer technician tickets' },

  // Mobile app
  { module: 'mobile', action: 'read', description: 'Use mobile field-service read endpoints' },
  { module: 'mobile', action: 'write', description: 'Create and sync mobile field-service records' },
  { module: 'mobile', action: 'admin', description: 'Full mobile field-service administration' },

  // Internal communication / chat
  { module: 'chat', action: 'read', description: 'View internal chat rooms and message history' },
  { module: 'chat', action: 'write', description: 'Send messages and manage own chat participation' },
  { module: 'chat', action: 'admin', description: 'Administer internal chat rooms and linked channels' },

  // Scheduling
  { module: 'scheduling', action: 'read', description: 'View schedules' },
  { module: 'scheduling', action: 'write', description: 'Create and update schedules' },
  { module: 'scheduling', action: 'admin', description: 'Full scheduling administration' },

  // Meetings
  { module: 'meetings', action: 'read', description: 'View meetings, attendance, minutes, and decisions' },
  { module: 'meetings', action: 'write', description: 'Create and update meetings, participants, notes, decisions, and follow-up tasks' },
  { module: 'meetings', action: 'delete', description: 'Delete meetings' },
  { module: 'meetings', action: 'admin', description: 'Full meeting administration' },

  // Quotations
  { module: 'quotations', action: 'read', description: 'View quotations' },
  { module: 'quotations', action: 'write', description: 'Create and update quotations' },
  { module: 'quotations', action: 'delete', description: 'Delete quotations' },
  { module: 'quotations', action: 'admin', description: 'Full quotation administration' },

  // Document Templates
  { module: 'documents', action: 'read', description: 'View generated PDFs and document repository records' },
  { module: 'documents', action: 'write', description: 'Upload and organize central document repository records' },
  { module: 'documents', action: 'delete', description: 'Delete generated document repository records' },
  { module: 'documents', action: 'read:all',       description: 'View every document, including those not released to the field' },

  // Vehicles (fleet)
  { module: 'vehicles', action: 'read', description: 'View vehicles and their details' },
  { module: 'vehicles', action: 'write', description: 'Create, update and manage vehicles' },
  { module: 'templates', action: 'read', description: 'View document templates and generated documents' },
  { module: 'templates', action: 'write', description: 'Create, update, preview, and generate document templates' },
  { module: 'templates', action: 'delete', description: 'Delete document templates and generated documents' },
  { module: 'templates', action: 'admin', description: 'Manage CI assets, template rollback, and document template administration' },

  // Invoicing
  { module: 'invoicing', action: 'read', description: 'View invoices' },
  { module: 'invoicing', action: 'write', description: 'Create and update invoices' },
  { module: 'invoicing', action: 'delete', description: 'Delete invoices' },
  { module: 'invoicing', action: 'admin', description: 'Full invoice administration' },

  // Accounting
  ...accountingPermissionDefinitions,

  // Reports
  { module: 'reports', action: 'read', description: 'View reports' },
  { module: 'reports', action: 'write', description: 'Create and manage reports' },

  // Files
  { module: 'files', action: 'upload', description: 'Upload files to shared storage' },
  { module: 'files', action: 'view', description: 'View and download shared files' },
  { module: 'files', action: 'list', description: 'List shared file metadata' },
  { module: 'files', action: 'delete', description: 'Delete shared files' },

  // Tasks
  { module: 'tasks', action: 'read', description: 'View tasks' },
  { module: 'tasks', action: 'write', description: 'Create and update tasks' },
  { module: 'tasks', action: 'delete', description: 'Delete tasks' },
  { module: 'tasks', action: 'admin', description: 'Full task administration' },

  // Catalog
  { module: 'catalog', action: 'read', description: 'View catalog articles and categories' },
  { module: 'catalog', action: 'write', description: 'Create and update catalog articles and categories' },
  { module: 'catalog', action: 'delete', description: 'Soft-delete catalog articles' },
  { module: 'catalog', action: 'price', description: 'Update article prices and manage price batches' },
  { module: 'catalog', action: 'admin', description: 'Full catalog administration — IGH import, bulk import, UoM management' },

  // Notifications
  { module: 'notifications', action: 'read', description: 'View notifications' },
  { module: 'notifications', action: 'write', description: 'Send and manage notifications' },
  { module: 'notifications', action: 'feed', description: 'Use personal notification feed' },
  { module: 'notifications', action: 'preferences', description: 'Manage own notification preferences' },
  { module: 'notifications', action: 'dispatch', description: 'Dispatch notifications through the central pipeline' },
  { module: 'notifications', action: 'templates:manage', description: 'Manage notification templates' },
  { module: 'notifications', action: 'scheduled:manage', description: 'Manage scheduled notifications' },
  { module: 'notifications', action: 'metrics:read', description: 'View notification delivery metrics' },

  // Integrations
  { module: 'integrations', action: 'admin', description: 'Manage integration providers and health checks' },
  { module: 'integrations', action: 'widget:manage', description: 'Manage public website widget submissions and config' },
  { module: 'integrations', action: 'calendar', description: 'Connect and manage calendar sync integrations' },

  // AI Assistant
  { module: 'ai', action: 'sessions', description: 'Use AI voice sessions' },
  { module: 'ai', action: 'commands:manage', description: 'Manage AI voice commands' },
  { module: 'ai', action: 'vocabulary:manage', description: 'Manage AI custom vocabulary' },
  { module: 'ai', action: 'analytics:read', description: 'View AI assistant analytics' },
  { module: 'ai', action: 'agents:manage', description: 'Enable or disable AI agents, trigger the emergency stop' },

  // Time Tracking
  { module: 'time-tracking', action: 'read', description: 'View time entries' },
  { module: 'time-tracking', action: 'write', description: 'Create and update time entries' },
  { module: 'time-tracking', action: 'admin', description: 'Full time tracking administration' },
  { module: 'time-tracking', action: 'book-others', description: 'Record working time on behalf of other employees' },

  // Settings
  { module: 'settings', action: 'read', description: 'View system settings' },
  { module: 'settings', action: 'admin', description: 'Manage system settings' },

  // Business Discovery (Google Places lead generation)
  { module: 'discovery', action: 'create', description: 'Start and cancel business discovery searches' },
  { module: 'discovery', action: 'read', description: 'View business discovery searches, results and usage' },
  { module: 'discovery', action: 'delete', description: 'Delete business discovery searches' },

  // Leads
  { module: 'lead', action: 'read', description: 'View leads' },
  { module: 'lead', action: 'write', description: 'Create and update leads' },
  { module: 'lead', action: 'import', description: 'Import discovered businesses as leads' },
  { module: 'lead', action: 'convert', description: 'Convert leads into customers' },
  { module: 'lead', action: 'whatsapp', description: 'Log WhatsApp contacts for leads' },
  { module: 'lead', action: 'enrich', description: 'Enrich leads from their website (fill missing contact fields)' },
  { module: 'lead', action: 'delete', description: 'Delete leads' },
];

// Role definitions with permission keys
export const ROLE_DEFINITIONS = [
  {
    name: 'Admin',
    description: 'Full system access, user management',
    permissionKeys: '*', // Always synced to all permissions
  },
  {
    name: 'Projektleiter',
    description: 'Manages projects, quotations, schedules',
    permissionKeys: [
      'crm:read', 'crm:write', 'crm:delete', 'crm:admin',
      'projects:read', 'projects:write', 'projects:delete', 'projects:admin',
      'project:create', 'project:edit', 'project:read', 'project:delete',
      'project:status:update', 'project:status:override',
      'project:prep-actions:manage', 'project:schedule:manage',
      'project:documents:read', 'project:documents:read:all', 'project:documents:write',
      'project:documents:create', 'project:documents:delete',
      'documents:read', 'documents:read:all', 'documents:write', 'documents:delete',
      'quotations:read', 'quotations:write', 'quotations:delete', 'quotations:admin',
      'templates:read', 'templates:write',
      'scheduling:read', 'scheduling:write', 'scheduling:admin',
      'time-tracking:read', 'time-tracking:book-others',
      'meetings:read', 'meetings:write', 'meetings:delete', 'meetings:admin',
      'field-service:read',
      'field-ticket:read', 'field-ticket:write', 'field-ticket:assign', 'field-ticket:comment', 'field-ticket:admin',
      'mobile:read', 'mobile:write', 'mobile:admin',
      'chat:read', 'chat:write', 'chat:admin',
      'files:upload', 'files:view', 'files:list', 'files:delete',
      'tasks:read', 'tasks:write', 'tasks:delete', 'tasks:admin',
      'notifications:read', 'notifications:write', 'notifications:feed', 'notifications:preferences',
      'notifications:dispatch', 'notifications:templates:manage', 'notifications:scheduled:manage',
      'notifications:metrics:read',
      'integrations:widget:manage',
      // The Projektleiter is the key user for the assistant: they see what an
      // agent produced on their own jobs, so they are the one who has to be
      // able to switch it off — without an administrator account.
      'ai:sessions', 'ai:agents:manage',
      'reports:read', 'reports:write',
      'time-tracking:read',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Techniker',
    description: 'Field operations, time tracking',
    permissionKeys: [
      'crm:read',
      'project:read', 'project:documents:read',
      'documents:read',
      'field-service:read', 'field-service:write', 'field-service:admin',
      'field-ticket:read', 'field-ticket:write', 'field-ticket:comment',
      'mobile:read', 'mobile:write',
      'chat:read', 'chat:write',
      'files:upload', 'files:view',
      'tasks:read', 'tasks:write',
      'meetings:read', 'meetings:write',
      'notifications:read', 'notifications:feed', 'notifications:preferences',
      'ai:sessions',
      'time-tracking:read', 'time-tracking:write', 'time-tracking:admin',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Buchhalter',
    description: 'Financial operations',
    permissionKeys: [
      'crm:read',
      'project:read', 'project:documents:read', 'project:documents:read:all',
      'documents:read', 'documents:read:all',
      'invoicing:read', 'invoicing:write', 'invoicing:delete', 'invoicing:admin',
      ...ACCOUNTING_PERMISSION_KEYS,
      'files:upload', 'files:view', 'files:list',
      'reports:read', 'reports:write',
      'quotations:read',
      'tasks:read',
      'meetings:read',
      'notifications:read', 'notifications:feed', 'notifications:preferences',
      'ai:sessions',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Disponent',
    description: 'Scheduling and resource planning',
    permissionKeys: [
      'crm:read',
      'project:read', 'project:schedule:manage', 'project:documents:read', 'project:documents:read:all',
      'documents:read', 'documents:read:all',
      'scheduling:read', 'scheduling:write', 'scheduling:admin',
      'time-tracking:read', 'time-tracking:book-others',
      'meetings:read', 'meetings:write', 'meetings:delete', 'meetings:admin',
      'field-service:read',
      'field-ticket:read', 'field-ticket:write', 'field-ticket:assign', 'field-ticket:comment', 'field-ticket:admin',
      'mobile:read', 'mobile:write',
      'chat:read', 'chat:write',
      'files:upload', 'files:view', 'files:list',
      'tasks:read', 'tasks:write',
      'notifications:read', 'notifications:write', 'notifications:feed', 'notifications:preferences',
      'notifications:dispatch', 'notifications:scheduled:manage',
      'integrations:calendar',
      'ai:sessions',
      'time-tracking:read',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Lehrling',
    description: 'Limited field access, supervised',
    permissionKeys: [
      'project:read',
      'documents:read',
      'field-service:read',
      'field-ticket:read', 'field-ticket:comment',
      'mobile:read', 'mobile:write',
      'chat:read', 'chat:write',
      'files:upload', 'files:view',
      'tasks:read',
      'meetings:read',
      'notifications:read', 'notifications:feed', 'notifications:preferences',
      'ai:sessions',
      'time-tracking:read', 'time-tracking:write', 'time-tracking:admin',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'User',
    description: 'Default role for new users with basic read access',
    permissionKeys: [
      'users:read',
      'roles:read',
      'crm:read',
      'projects:read',
      'project:read',
      'chat:read', 'chat:write',
      'files:upload', 'files:view',
      'tasks:read', 'tasks:write',
      'meetings:read', 'meetings:write',
      'notifications:read', 'notifications:feed', 'notifications:preferences',
      'ai:sessions',
      'time-tracking:read', 'time-tracking:write',
    ],
  },
];

/**
 * Seed a small starter fleet — ONLY on a completely empty vehicles collection.
 *
 * Prod-safe by design:
 *  - Runs once on a fresh DB. `countDocuments` ignores the soft-delete hook, so a
 *    vehicle the customer later deletes still counts → seeding never runs again and
 *    never resurrects removed vehicles.
 *  - Drivers are resolved from real active users (first available non-admin
 *    employees). If none exist yet, vehicles are seeded without a driver and the
 *    customer assigns one in the UI. No demo user accounts are created.
 */
async function seedStarterVehicles() {
  const existing = await Vehicle.countDocuments();
  if (existing > 0) {
    logger.info('Vehicles already present — skipping starter fleet seed', { module: 'seed', count: existing });
    return;
  }

  const DAY = 24 * 60 * 60 * 1000;
  const daysFromNow = (n) => new Date(Date.now() + n * DAY);
  const monthsAgo = (n) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d;
  };

  // createdBy: the seeded admin (if configured), else any Admin-role user.
  const adminRole = await Role.findOne({ name: 'Admin' });
  let creator = config.admin?.email
    ? await User.findOne({ email: config.admin.email.toLowerCase() })
    : null;
  if (!creator && adminRole) creator = await User.findOne({ role: adminRole._id });
  const creatorId = creator?._id || null;

  // Driver pool: real active employees (exclude admins). Assigned round-robin so
  // the seeded vehicles link to whoever actually exists in this environment.
  const driverFilter = { status: 'active' };
  if (adminRole) driverFilter.role = { $ne: adminRole._id };
  const driverPool = await User.find(driverFilter).sort({ createdAt: 1 }).limit(5).select('_id').lean();
  const driverAt = (i) => driverPool[i]?._id || null;

  const defs = [
    {
      kennzeichen: 'ZH 128 540', label: 'Servicebus 1', make: 'VW', model: 'Crafter',
      fuelType: 'diesel', year: 2021, mileageKm: 84200, status: 'in_use', driverId: driverAt(0),
      lastServiceDate: monthsAgo(3), lastServiceKm: 78000, lastServiceGarage: 'Garage Müller AG',
      nextServiceDate: daysFromNow(75), nextServiceKm: 95000,
      services: [
        { date: monthsAgo(3), mileageKm: 78000, description: 'Grosser Service, Ölwechsel und Bremsen hinten', garage: 'Garage Müller AG', cost: 1240 },
      ],
      materials: [
        { name: 'Werkzeugkoffer Sanitär', quantity: 1, unit: 'Set' },
        { name: 'Warndreieck', quantity: 1, unit: 'Stk' },
        { name: 'Feuerlöscher 2 kg', quantity: 1, unit: 'Stk' },
      ],
      notes: [
        { body: 'Winterreifen eingelagert bei der Garage.', category: 'service' },
      ],
    },
    {
      kennzeichen: 'BE 245 118', label: 'Servicebus 2', make: 'Ford', model: 'Transit',
      fuelType: 'diesel', year: 2020, mileageKm: 112500, status: 'available', driverId: driverAt(1),
      lastServiceDate: monthsAgo(5), lastServiceKm: 104000, lastServiceGarage: 'AMAG',
      nextServiceDate: daysFromNow(30), nextServiceKm: 120000,
      services: [
        { date: monthsAgo(5), mileageKm: 104000, description: 'Service inkl. Zahnriemenwechsel', garage: 'AMAG', cost: 1580 },
      ],
      materials: [
        { name: 'Wärmepumpen-Messgerät', quantity: 1, unit: 'Stk' },
      ],
      notes: [
        { body: 'Nächster Service bald fällig – Termin vereinbaren.', category: 'warning' },
      ],
    },
    {
      kennzeichen: 'ZH 401 992', label: 'Poolfahrzeug', make: 'Renault', model: 'Zoe',
      fuelType: 'electric', year: 2023, mileageKm: 18300, status: 'available', driverId: null,
      lastServiceDate: monthsAgo(8), lastServiceKm: 9000, lastServiceGarage: 'Renault Retail',
      nextServiceDate: daysFromNow(120), nextServiceKm: 30000,
      services: [
        { date: monthsAgo(8), mileageKm: 9000, description: 'Erstservice Elektrofahrzeug', garage: 'Renault Retail', cost: 260 },
      ],
      materials: [
        { name: 'Ladekabel Typ 2', quantity: 1, unit: 'Stk' },
      ],
      notes: [
        { body: 'Poolfahrzeug – kein fester Fahrer.', category: 'general' },
      ],
    },
  ];

  let count = 0;
  for (const d of defs) {
    const vehicle = await Vehicle.create({
      kennzeichen: d.kennzeichen, label: d.label, make: d.make, model: d.model,
      fuelType: d.fuelType, year: d.year, mileageKm: d.mileageKm, status: d.status,
      currentDriverId: d.driverId,
      lastServiceDate: d.lastServiceDate, lastServiceKm: d.lastServiceKm, lastServiceGarage: d.lastServiceGarage,
      nextServiceDate: d.nextServiceDate, nextServiceKm: d.nextServiceKm,
      createdBy: creatorId, updatedBy: creatorId,
    });
    if (d.services?.length) {
      await VehicleServiceEntry.insertMany(d.services.map((s) => ({ ...s, vehicleId: vehicle._id, createdBy: creatorId })));
    }
    if (d.materials?.length) {
      await VehicleMaterial.insertMany(d.materials.map((m) => ({ ...m, vehicleId: vehicle._id, createdBy: creatorId })));
    }
    if (d.notes?.length) {
      await VehicleNote.insertMany(d.notes.map((n) => ({ ...n, vehicleId: vehicle._id, createdBy: creatorId })));
    }
    count += 1;
  }
  logger.info(`Seeded starter fleet (${count} vehicles)`, { module: 'seed' });
}

/**
 * Seed one starter object (site) with its Objektinformationen — ONLY on a
 * completely empty sites collection. Same prod-safe contract as the fleet:
 * countDocuments ignores the soft-delete hook, so an object the customer later
 * deletes still counts → this never runs again and never modifies real objects.
 * On a fresh DB the starter object lives under a clearly-labelled "Muster"
 * customer that the customer can edit or delete.
 */
async function seedStarterObject() {
  const existing = await Site.countDocuments();
  if (existing > 0) {
    logger.info('Objects already present — skipping starter object seed', { module: 'seed', count: existing });
    return;
  }

  const adminRole = await Role.findOne({ name: 'Admin' });
  let creator = config.admin?.email
    ? await User.findOne({ email: config.admin.email.toLowerCase() })
    : null;
  if (!creator && adminRole) creator = await User.findOne({ role: adminRole._id });
  const creatorId = creator?._id || null;
  // Customer/Site require createdBy — without an admin there is nothing to seed.
  if (!creatorId) {
    logger.info('No admin user yet — skipping starter object seed', { module: 'seed' });
    return;
  }

  // Dedicated demo customer (never attach the demo object to a real customer).
  let customer = await Customer.findOne({ name: 'Muster Immobilien AG' });
  if (!customer) {
    customer = await Customer.create({
      customerNumber: await crmCounter.getNextCustomerNumber(),
      name: 'Muster Immobilien AG',
      type: 'business',
      street: 'Musterstrasse 1', postalCode: '4001', city: 'Basel', canton: 'BS',
      status: 'active', createdBy: creatorId,
    });
  }

  await Site.create({
    customerId: customer._id,
    siteNumber: await crmCounter.getNextSiteNumber(customer._id),
    name: 'MFH Musterweg 12',
    street: 'Musterweg 12', postalCode: '4001', city: 'Basel', canton: 'BS',
    floorUnit: '4. OG',
    siteType: 'residential',
    accessInstructions: 'Schlüssel bei Hauswart Muster.',
    emergencyHeating: { present: true, number: 'NH-2023-07' },
    keyBox: { present: true, code: '2580', depositedBy: 'Klaus Huber', depositedAt: new Date('2024-03-12') },
    advertisingBoard: { count: 2, type: 'Updata Standard', location: 'Eingang / Fassade' },
    createdBy: creatorId,
  });
  logger.info('Seeded starter object with Objektinformationen', { module: 'seed' });
}

export async function seedDatabase() {
  try {
    // 1. Upsert all permissions — runs on every startup so new entries reach existing DBs
    await Promise.all(
      PERMISSION_DEFINITIONS.map((def) =>
        Permission.findOneAndUpdate(
          { module: def.module, action: def.action },
          { $setOnInsert: def },
          { upsert: true, returnDocument: 'after' },
        ),
      ),
    );

    // Build lookup map: 'module:action' → ObjectId
    const allPermissions = await Permission.find();
    const permMap = new Map();
    for (const p of allPermissions) {
      permMap.set(`${p.module}:${p.action}`, p._id);
    }
    const allPermIds = [...permMap.values()];

    logger.info(`Permissions synced (${allPermissions.length} total)`, { module: 'seed' });

    // 2. Seed or update roles
    for (const roleDef of ROLE_DEFINITIONS) {
      const permIds =
        roleDef.permissionKeys === '*'
          ? allPermIds
          : roleDef.permissionKeys.map((key) => permMap.get(key)).filter(Boolean);

      const existingRole = await Role.findOne({ name: roleDef.name });

      if (existingRole) {
        if (roleDef.permissionKeys === '*') {
          // Admin: always own every permission (keeps pace with new modules)
          await Role.updateOne({ _id: existingRole._id }, { $set: { permissions: permIds } });
        } else {
          // Other roles: add any new permissions without removing manually-granted ones
          await Role.updateOne(
            { _id: existingRole._id },
            { $addToSet: { permissions: { $each: permIds } } },
          );
        }
      } else {
        await Role.create({
          name: roleDef.name,
          description: roleDef.description,
          permissions: permIds,
          isSystem: true,
        });
        logger.info(`Seeded role: ${roleDef.name} (${permIds.length} permissions)`, { module: 'seed' });
      }
    }

    // 3. Invalidate permission caches so stale [] entries don't block updated roles
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}auth:permissions:*`);
      logger.info('Permission caches invalidated', { module: 'seed' });
    } catch {
      // Non-fatal: Redis may not be ready yet during very early startup
    }

    // 4. Seed admin user (if env vars are set) — idempotent
    if (config.admin?.email && config.admin?.password) {
      const existingAdmin = await User.findOne({ email: config.admin.email.toLowerCase() });
      if (!existingAdmin) {
        const adminRole = await Role.findOne({ name: 'Admin' });
        if (adminRole) {
          const hashedPw = await hashPassword(config.admin.password);

          const adminUser = await User.create({
            email: config.admin.email.toLowerCase(),
            passwordHash: hashedPw,
            firstName: config.admin.firstName || 'System',
            lastName: config.admin.lastName || 'Administrator',
            role: adminRole._id,
            status: 'active',
            passwordChangedAt: new Date(),
          });

          await PasswordHistory.create({
            userId: adminUser._id,
            passwordHash: hashedPw,
          });

          logger.info('Seeded admin user', { module: 'seed', email: config.admin.email });
        }
      }
    }

    // 4b. Seed approved default document templates — without them every PDF
    // preview fails with "DocumentTemplate 'type:…' not found". Idempotent:
    // only creates types that don't exist yet, never touches edited templates.
    {
      const adminRole = await Role.findOne({ name: 'Admin' });
      const anyAdmin = adminRole ? await User.findOne({ role: adminRole._id }) : null;
      if (anyAdmin) {
        await seedDoctplTemplates(anyAdmin._id);
      } else {
        logger.warn('No admin user found — skipping document template seed', { module: 'seed' });
      }
    }

    // 4c. Seed the working content the office needs on day one — offer text
    // blocks, the catalogue of standard works, office-hour categories. Without
    // it a fresh production database opens on empty screens.
    {
      const adminRole = await Role.findOne({ name: 'Admin' });
      const anyAdmin = adminRole ? await User.findOne({ role: adminRole._id }) : null;
      await seedOperations(anyAdmin?._id);
    }

    // 4d. Declare the AI agents (registry, kill switches, risk rules). Agents
    // are seeded disabled and switched on from the admin screen once their
    // capabilities exist.
    await seedAgentRegistry();

    // 4e. Standard task checklists Projekt AI opens with a project.
    await seedProjectTaskTemplates();

    // 5. Seed default departments (Abteilungen) — required to create quotations /
    // orders / invoices (and their per-department numbering). Without at least one,
    // a fresh install is blocked from the entire commercial flow. Idempotent by code.
    // Commercial departments (scopeQop) drive QOP numbering; the operational ones
    // (Projekte/Disposition/Buchhaltung/Administration) are task-board only.
    const DEFAULT_DEPARTMENTS = [
      { name: 'Heizung', code: 'HZ', color: '#EF4444', icon: 'Flame', sortOrder: 1, scopeQop: true, scopeTasks: true },
      { name: 'Sanitär', code: 'SA', color: '#3B82F6', icon: 'Droplet', sortOrder: 2, scopeQop: true, scopeTasks: true },
      { name: 'Projekte', code: 'PR', color: '#8B5CF6', icon: 'FolderKanban', sortOrder: 3, scopeQop: false, scopeTasks: true },
      { name: 'Service', code: 'SV', color: '#22C55E', icon: 'Wrench', sortOrder: 4, scopeQop: true, scopeTasks: true },
      { name: 'Disposition', code: 'DI', color: '#F59E0B', icon: 'ClipboardList', sortOrder: 5, scopeQop: false, scopeTasks: true },
      { name: 'Buchhaltung', code: 'BU', color: '#14B8A6', icon: 'Receipt', sortOrder: 6, scopeQop: false, scopeTasks: true },
      { name: 'Administration', code: 'AD', color: '#64748B', icon: 'Building2', sortOrder: 7, scopeQop: false, scopeTasks: true },
    ];
    for (const dept of DEFAULT_DEPARTMENTS) {
      const before = await Department.findOneAndUpdate(
        { code: dept.code },
        {
          $setOnInsert: {
            name: dept.name, code: dept.code, isActive: true,
            color: dept.color, icon: dept.icon, sortOrder: dept.sortOrder,
            scopeQop: dept.scopeQop, scopeTasks: dept.scopeTasks,
          },
        },
        { upsert: true, new: false },
      );
      // Backfill presentation/scope on departments created before these fields
      // existed (only when missing, so admin edits are preserved).
      if (before && before.color == null) {
        await Department.updateOne(
          { code: dept.code },
          { $set: { color: dept.color, icon: dept.icon, sortOrder: dept.sortOrder, scopeQop: dept.scopeQop, scopeTasks: dept.scopeTasks } },
        );
      }
    }
    logger.info('Seeded default departments', { module: 'seed', count: DEFAULT_DEPARTMENTS.length });

    // 6. Seed catalog data (units of measure, etc.)
    await seedCatalog();

    // 6. Seed AI assistant vocabulary and voice commands
    await seedAiVocabulary();
    await seedAiCommands();

    // 7. Seed a small starter fleet (only when the vehicles collection is empty)
    await seedStarterVehicles();

    // 8. Seed a starter object with Objektinformationen (only when sites empty)
    await seedStarterObject();

    logger.info('Database seeding complete', { module: 'seed' });
  } catch (err) {
    logger.error('Database seeding failed', {
      module: 'seed',
      error: { message: err.message, stack: err.stack },
    });
    throw err;
  }
}

export default seedDatabase;
