import taskReminderService from './taskReminder.service.js';

class TaskReminderController {
  async list(req, res, next) {
    try {
      const reminders = await taskReminderService.getByTaskId(req.params.taskId);
      return res.success({ data: reminders });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const reminder = await taskReminderService.create(req.params.taskId, req.body, req.user._id, meta);
      return res.success({ data: reminder, message: 'Reminder created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await taskReminderService.remove(req.params.taskId, req.params.reminderId, req.user._id, meta);
      return res.success({ data: result, message: 'Reminder deleted successfully' });
    } catch (err) { next(err); }
  }

  async getUserDefaults(req, res, next) {
    try {
      const defaults = await taskReminderService.getUserDefaults(req.user._id);
      return res.success({ data: defaults });
    } catch (err) { next(err); }
  }

  async setUserDefaults(req, res, next) {
    try {
      const defaults = await taskReminderService.setUserDefaults(req.user._id, req.body);
      return res.success({ data: defaults, message: 'Reminder defaults updated successfully' });
    } catch (err) { next(err); }
  }
}

const taskReminderController = new TaskReminderController();
export default taskReminderController;
