import { z } from 'zod';
import { createTool } from './tool.runner.js';

export const fetchWorkforcePlanningContextTool = createTool({
  name: 'fetch_workforce_planning_context',
  description: 'Fetches workforce planning, time balance, overtime, deficit, leave pressure, and absence context.',
  schema: z.object({
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    employeeId: z.string().optional(),
    year: z.number().int().min(2000).max(2100).optional(),
  }),
  requiredPermission: 'time-tracking:read',
  execute: async (input) => {
    const { default: timeTrackingService } = await import('../../timeTracking/timeTracking.service.js');
    return timeTrackingService.getAiContext(input);
  },
});
