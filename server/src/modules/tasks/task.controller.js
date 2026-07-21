import taskService from './task.service.js';

class TaskController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const task = await taskService.create(req.body, req.user._id, meta);
      return res.success({ data: task, message: 'Task created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const isAdmin = req.user.role?.name === 'Admin';
      const result = await taskService.list(query, req.user._id, { isAdmin });
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const isAdmin = req.user.role?.name === 'Admin';
      const task = await taskService.getById(req.params.id, req.user._id, { isAdmin });
      return res.success({ data: task });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const task = await taskService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: task, message: 'Task updated successfully' });
    } catch (err) { next(err); }
  }

  async batchPatch(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const tasks = await taskService.batchPatch(req.body.updates, req.user._id, meta);
      return res.success({ data: tasks, message: 'Tasks updated successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await taskService.remove(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Task deleted successfully' });
    } catch (err) { next(err); }
  }

  async changeStatus(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const task = await taskService.changeStatus(req.params.id, req.body.status, req.user._id, {
        ...meta,
        expectedVersion: req.body.expectedVersion,
        sortOrder: req.body.sortOrder,
        completeSubtasks: req.body.completeSubtasks === true,
        completeParentOnly: req.body.completeParentOnly === true,
      });
      return res.success({ data: task, message: 'Task status updated successfully' });
    } catch (err) { next(err); }
  }

  async setLock(req, res, next) {
    try {
      const meta = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        isAdmin: req.user.role?.name === 'Admin',
        expectedVersion: req.body.expectedVersion,
      };
      const task = await taskService.setLock(req.params.id, req.body.locked, req.user._id, meta);
      return res.success({ data: task, message: req.body.locked ? 'Task locked successfully' : 'Task unlocked successfully' });
    } catch (err) { next(err); }
  }

  async complete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const options = {
        completeSubtasks: req.body.completeSubtasks === true,
        completeParentOnly: req.body.completeParentOnly === true,
      };
      const task = await taskService.complete(req.params.id, req.user._id, meta, options);
      return res.success({ data: task, message: 'Task completed successfully' });
    } catch (err) { next(err); }
  }

  async reopen(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const task = await taskService.reopen(req.params.id, req.user._id, meta);
      return res.success({ data: task, message: 'Task reopened successfully' });
    } catch (err) { next(err); }
  }

  async moveToList(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const task = await taskService.moveToList(req.params.id, req.body.listId, req.user._id, meta);
      return res.success({ data: task, message: 'Task moved successfully' });
    } catch (err) { next(err); }
  }

  async bulkOperation(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await taskService.bulkOperation(req.body.action, req.body.taskIds, req.body.data, req.user._id, meta);
      return res.success({ data: result, message: 'Bulk operation completed successfully' });
    } catch (err) { next(err); }
  }

  async createSubtask(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const subtask = await taskService.createSubtask(req.params.parentId, req.body, req.user._id, meta);
      return res.success({ data: subtask, message: 'Subtask created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getSubtasks(req, res, next) {
    try {
      const subtasks = await taskService.getSubtasks(req.params.parentId, req.user._id);
      return res.success({ data: subtasks });
    } catch (err) { next(err); }
  }

  async promote(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const task = await taskService.promote(req.params.id, req.user._id, meta);
      return res.success({ data: task, message: 'Task promoted successfully' });
    } catch (err) { next(err); }
  }

  async reorderSubtasks(req, res, next) {
    try {
      const result = await taskService.reorderSubtasks(req.params.parentId, req.body.orderedIds, req.user._id);
      return res.success({ data: result, message: 'Subtasks reordered successfully' });
    } catch (err) { next(err); }
  }
}

const taskController = new TaskController();
export default taskController;
