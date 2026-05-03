import { z } from 'zod';
import { createTool } from './tool.runner.js';

export const fetchUserContextTool = createTool({
  name: 'fetch_user_context',
  description: 'Fetches the current user profile, role, and permissions from the ERP system.',
  schema: z.object({
    userId: z.string().describe('MongoDB ObjectId of the user'),
  }),
  requiredPermission: null,
  execute: async ({ userId }) => {
    const { default: userService } = await import('../../auth/user.service.js');
    const user = await userService.getById(userId);
    if (!user) return { found: false };
    return {
      found: true,
      userId: user._id.toString(),
      name: `${user.firstName} ${user.lastName}`,
      role: user.role?.name,
      isActive: user.isActive,
    };
  },
});

export const fetchEntityContextTool = createTool({
  name: 'fetch_entity_context',
  description: 'Fetches an ERP entity (customer, lead, invoice, task) by ID to verify it exists before acting on it.',
  schema: z.object({
    entityType: z.enum(['customer', 'lead', 'invoice', 'task']).describe('Type of ERP entity'),
    entityId: z.string().describe('MongoDB ObjectId of the entity'),
  }),
  requiredPermission: null,
  execute: async ({ entityType, entityId }) => {
    const serviceMap = {
      customer: () => import('../../crm/customer.service.js'),
      lead: () => import('../../crm/lead.service.js'),
      invoice: () => import('../../accounting/invoice.service.js'),
      task: () => import('../../tasks/task.service.js'),
    };
    const loader = serviceMap[entityType];
    if (!loader) return { found: false, error: 'Unknown entity type' };
    try {
      const { default: svc } = await loader();
      const entity = await svc.getById(entityId);
      return entity
        ? { found: true, id: entity._id.toString(), status: entity.status }
        : { found: false };
    } catch {
      return { found: false, error: 'Entity lookup failed' };
    }
  },
});
