import { z } from 'zod';
import { createTool } from './tool.runner.js';

export const analyzeFieldTicketTool = createTool({
  name: 'analyze_field_ticket',
  description: 'Categorizes a technician ticket, recommends priority, assignment context, and next actions.',
  schema: z.object({
    ticketId: z.string().describe('MongoDB ObjectId of the field ticket to analyze'),
  }),
  requiredPermission: 'field-ticket:write',
  execute: async ({ ticketId }, { userId }) => {
    const { default: fieldTicketService } = await import('../../fieldTickets/fieldTicket.service.js');
    const ticket = await fieldTicketService.analyze(ticketId, userId, { source: 'ai-agent' });
    return {
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      priority: ticket.priority,
      status: ticket.status,
      ai: ticket.ai,
    };
  },
});
