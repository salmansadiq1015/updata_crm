import TaskAttachment from './taskAttachment.model.js';

class TaskAttachmentRepository {
  async create(data) {
    const attachment = new TaskAttachment(data);
    return attachment.save();
  }

  async findById(id) {
    return TaskAttachment.findById(id).lean();
  }

  async findByTaskId(taskId) {
    return TaskAttachment.find({ taskId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async countByTaskId(taskId) {
    return TaskAttachment.countDocuments({ taskId });
  }

  async softDelete(id) {
    return TaskAttachment.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }
}

const taskAttachmentRepository = new TaskAttachmentRepository();
export default taskAttachmentRepository;
