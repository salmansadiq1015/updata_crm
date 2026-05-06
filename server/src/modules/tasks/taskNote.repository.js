import TaskNote from './taskNote.model.js';

class TaskNoteRepository {
  async create(data) {
    const note = new TaskNote(data);
    return note.save();
  }

  async findById(id) {
    return TaskNote.findById(id).lean();
  }

  async findByTaskId(taskId) {
    return TaskNote.find({ taskId })
      .sort({ createdAt: 1 })
      .lean();
  }

  async countByTaskId(taskId) {
    return TaskNote.countDocuments({ taskId });
  }

  async updateById(id, data) {
    return TaskNote.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return TaskNote.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }
}

const taskNoteRepository = new TaskNoteRepository();
export default taskNoteRepository;
