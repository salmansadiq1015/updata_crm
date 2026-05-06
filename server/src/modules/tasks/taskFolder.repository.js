import TaskFolder from './taskFolder.model.js';

class TaskFolderRepository {
  async create(data) {
    const folder = new TaskFolder(data);
    return folder.save();
  }

  async findById(id) {
    return TaskFolder.findById(id).lean();
  }

  async findByOwnerId(ownerId) {
    return TaskFolder.find({ ownerId }).sort({ sortOrder: 1, createdAt: 1 }).lean();
  }

  async updateById(id, data) {
    return TaskFolder.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true }).lean();
  }

  async softDelete(id) {
    return TaskFolder.findByIdAndUpdate(id, { isDeleted: true, deletedAt: new Date() }, { returnDocument: 'after' });
  }

  async bulkUpdateSortOrder(updates) {
    const ops = updates.map(({ id, sortOrder }) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder } } },
    }));
    return TaskFolder.bulkWrite(ops);
  }

  async countByOwnerId(ownerId) {
    return TaskFolder.countDocuments({ ownerId, isDeleted: false });
  }
}

const taskFolderRepository = new TaskFolderRepository();
export default taskFolderRepository;
