import { z } from 'zod';
import { createTool } from './tool.runner.js';

// Statuses from task.model.js: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
// Priorities from task.model.js: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']
// create(data, userId, meta) — assignee field is 'assigneeId', returns full task document
// update(id, data, userId, meta) — returns updated task document

export const createTaskTool = createTool({
  name: 'create_task',
  description: 'Creates a new task in the ERP task management system and assigns it to a user.',
  schema: z.object({
    title: z.string().min(3).max(255).describe('Task title'),
    description: z.string().max(2000).optional().describe('Task description'),
    assignedTo: z.string().optional().describe('MongoDB ObjectId of assigned user'),
    dueDate: z.string().optional().describe('ISO date string for due date'),
    priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    projectId: z.string().optional().describe('MongoDB ObjectId of the project'),
  }),
  requiredPermission: 'tasks:create',
  compensationAction: 'delete_task',
  execute: async ({ title, description, assignedTo, dueDate, priority, projectId }, { userId }) => {
    const { default: taskService } = await import('../../tasks/task.service.js');

    const data = {
      title,
      ...(description !== undefined && { description }),
      ...(assignedTo !== undefined && { assigneeId: assignedTo }),
      ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
      priority,
      ...(projectId !== undefined && { projectId }),
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
  description: 'Updates an existing task — status, assignee, or due date.',
  schema: z.object({
    taskId: z.string().describe('MongoDB ObjectId of the task'),
    status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    assignedTo: z.string().optional().describe('MongoDB ObjectId of the user to assign the task to'),
    dueDate: z.string().optional().describe('ISO date string for new due date'),
  }),
  requiredPermission: 'tasks:update',
  execute: async ({ taskId, status, assignedTo, dueDate }, { userId }) => {
    const { default: taskService } = await import('../../tasks/task.service.js');

    const updates = {
      ...(status !== undefined && { status }),
      ...(assignedTo !== undefined && { assigneeId: assignedTo }),
      ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
    };

    const task = await taskService.update(taskId, updates, userId, { source: 'ai-agent' });

    return {
      taskId: task._id.toString(),
      status: task.status,
    };
  },
});
