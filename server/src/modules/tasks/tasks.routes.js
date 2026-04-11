import { Router } from 'express';
import taskRoutes from './task.routes.js';
import taskListRoutes from './taskList.routes.js';
import taskNoteRoutes from './taskNote.routes.js';
import taskAttachmentRoutes from './taskAttachment.routes.js';
import taskReminderRoutes from './taskReminder.routes.js';
import taskDashboardRoutes, { projectTaskRouter, orderTaskRouter, crossProjectRouter } from './taskDashboard.routes.js';

const router = Router();

// Dashboard & sync routes (mounted before /:id to avoid conflicts)
router.use('/', taskDashboardRoutes);

// Core task CRUD + subtasks + bulk
router.use('/', taskRoutes);

// Nested resources (notes, attachments, reminders under tasks/:taskId)
router.use('/:taskId/notes', taskNoteRoutes);
router.use('/:taskId/attachments', taskAttachmentRoutes);
router.use('/:taskId/reminders', taskReminderRoutes);

export { projectTaskRouter, orderTaskRouter, crossProjectRouter };
export default router;
