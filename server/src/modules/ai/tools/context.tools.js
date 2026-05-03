import { z } from 'zod';
import { createTool } from './tool.runner.js';

// Fix 5: Handle NotFoundError thrown by userService.getById instead of null-checking
export const fetchUserContextTool = createTool({
  name: 'fetch_user_context',
  description: 'Fetches the current user profile, role, and permissions from the ERP system.',
  schema: z.object({
    userId: z.string().describe('MongoDB ObjectId of the user'),
  }),
  requiredPermission: null,
  execute: async ({ userId }) => {
    const { default: userService } = await import('../../auth/user.service.js');
    try {
      const user = await userService.getById(userId);
      return {
        found: true,
        userId: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        role: user.role?.name,
        isActive: user.isActive,
      };
    } catch (err) {
      if (err?.statusCode === 404 || err?.name === 'NotFoundError') return { found: false };
      throw err;
    }
  },
});

// Fix 6: Use adapter pattern with correct service paths; forward userId to task service.
// Removed 'lead' (no lead.service.js in crm/) and 'invoice' (no invoice.service.js in accounting/).
// The accounting module has arReceivables.service.js and apInvoice.service.js but no single
// generic invoice service — these entity types are excluded until a canonical service is confirmed.
const adapters = {
  customer: async (entityId) => {
    const { default: svc } = await import('../../crm/customer.service.js');
    return svc.getById(entityId);
  },
  task: async (entityId, userId) => {
    const { default: svc } = await import('../../tasks/task.service.js');
    return svc.getById(entityId, userId);
  },
};

export const fetchEntityContextTool = createTool({
  name: 'fetch_entity_context',
  description: 'Fetches an ERP entity (customer, task) by ID to verify it exists before acting on it.',
  schema: z.object({
    entityType: z.enum(['customer', 'task']).describe('Type of ERP entity'),
    entityId: z.string().describe('MongoDB ObjectId of the entity'),
  }),
  requiredPermission: null,
  execute: async ({ entityType, entityId }, { userId }) => {
    const adapter = adapters[entityType];
    if (!adapter) return { found: false, error: 'Unknown entity type' };
    try {
      const entity = await adapter(entityId, userId);
      return entity
        ? { found: true, id: entity._id.toString(), status: entity.status }
        : { found: false };
    } catch (err) {
      if (err?.statusCode === 404 || err?.name === 'NotFoundError') return { found: false };
      return { found: false, error: 'Entity lookup failed' };
    }
  },
});
