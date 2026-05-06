import TaskReminder from './taskReminder.model.js';

class TaskReminderRepository {
  async create(data) {
    const reminder = new TaskReminder(data);
    return reminder.save();
  }

  async findById(id) {
    return TaskReminder.findById(id).lean();
  }

  async findByTaskId(taskId) {
    return TaskReminder.find({ taskId })
      .sort({ fireAt: 1 })
      .lean();
  }

  async findByUserId(userId, { status } = {}) {
    const filter = { userId };
    if (status) filter.status = status;
    return TaskReminder.find(filter)
      .sort({ fireAt: 1 })
      .lean();
  }

  async countByTaskId(taskId) {
    return TaskReminder.countDocuments({ taskId });
  }

  async findDueReminders(now) {
    return TaskReminder.find({
      $or: [
        { status: 'PENDING', fireAt: { $lte: now } },
        { status: 'SNOOZED', snoozedUntil: { $lte: now } },
      ],
    })
      .sort({ fireAt: 1 })
      .lean();
  }

  async updateById(id, data) {
    return TaskReminder.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async deleteById(id) {
    return TaskReminder.findByIdAndDelete(id);
  }

  async deleteByTaskId(taskId) {
    return TaskReminder.deleteMany({ taskId });
  }

  async cancelByTaskId(taskId) {
    return TaskReminder.updateMany(
      { taskId, status: 'PENDING' },
      { status: 'CANCELLED' },
    );
  }
}

const taskReminderRepository = new TaskReminderRepository();
export default taskReminderRepository;
