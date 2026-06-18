import { z } from 'zod';
import { createTool } from './tool.runner.js';

// Statuses from task.model.js: ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']
// Priorities from task.model.js: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']
// create(data, userId, meta) — assignee field is 'assigneeId', returns full task document
// update(id, data, userId, meta) — returns updated task document

export const createTaskTool = createTool({
  name: 'create_task',
  description: 'Creates a new task in the ERP task management system and assigns it to a user.',
  schema: z.object({
    title: z.string().min(3).max(500).describe('Task title'),
    description: z.string().max(2000).optional().describe('Task description'),
    assignedTo: z.string().optional().describe('MongoDB ObjectId of assigned user'),
    dueDate: z.string().datetime({ offset: true }).optional().describe('ISO 8601 date string for due date'),
    priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    projectId: z.string().optional().describe('MongoDB ObjectId of the project'),
    orderId: z.string().optional().describe('MongoDB ObjectId of the order/job'),
  }),
  requiredPermission: 'tasks:write',
  compensationAction: 'delete_task',
  execute: async ({ title, description, assignedTo, dueDate, priority, projectId, orderId }, { userId }) => {
    const { default: taskService } = await import('../../tasks/task.service.js');

    if (projectId && orderId) {
      throw new Error('create_task accepts either projectId or orderId, not both');
    }

    const data = {
      title,
      ...(description !== undefined && { description }),
      ...(assignedTo !== undefined && { assigneeId: assignedTo }),
      ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
      priority,
      ...(projectId !== undefined && { projectId }),
      ...(orderId !== undefined && { orderId }),
    };

    const task = await taskService.create(data, userId, { source: 'ai-agent' });

    return {
      taskId: task._id.toString(),
      title: task.title,
      status: task.status,
      priority: task.priority,
    };
  },
});

export const updateTaskTool = createTool({
  name: 'update_task',
  description: 'Updates an existing task — status, assignee, due date, or priority.',
  schema: z.object({
    taskId: z.string().describe('MongoDB ObjectId of the task'),
    status: z.enum(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
    assignedTo: z.string().optional().describe('MongoDB ObjectId of the user to assign the task to'),
    dueDate: z.string().datetime({ offset: true }).optional().describe('ISO 8601 date string for new due date'),
    priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  }),
  requiredPermission: 'tasks:write',
  execute: async ({ taskId, status, assignedTo, dueDate, priority }, { userId }) => {
    const { default: taskService } = await import('../../tasks/task.service.js');

    const updates = {
      ...(status !== undefined && { status }),
      ...(assignedTo !== undefined && { assigneeId: assignedTo }),
      ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
      ...(priority !== undefined && { priority }),
    };

    if (Object.keys(updates).length === 0) {
      throw new Error('update_task requires at least one field to update: status, assignedTo, dueDate, or priority');
    }

    const task = await taskService.update(taskId, updates, userId, { source: 'ai-agent' });

    return {
      taskId: task._id.toString(),
      status: task.status,
    };
  },
});
