import TaskList from './taskList.model.js';
import TaskListMember from './taskListMember.model.js';

class TaskListRepository {
  async create(data) {
    const list = new TaskList(data);
    return list.save();
  }

  async findById(id) {
    return TaskList.findById(id).lean();
  }

  async findByOwnerId(ownerId, { includeArchived = false } = {}) {
    const filter = { ownerId };
    if (!includeArchived) filter.isArchived = false;
    return TaskList.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
  }

  async findDefaultByOwnerId(ownerId) {
    return TaskList.findOne({ ownerId, isDefault: true }).lean();
  }

  async findGroupListsByUserId(userId) {
    const memberships = await TaskListMember.find({ userId }).select('listId').lean();
    const listIds = memberships.map((m) => m.listId);
    return TaskList.find({ _id: { $in: listIds }, isArchived: false }).sort({ sortOrder: 1 }).lean();
  }

  async countByOwnerId(ownerId) {
    return TaskList.countDocuments({ ownerId });
  }

  async updateById(id, data) {
    return TaskList.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true }).lean();
  }

  async softDelete(id) {
    return TaskList.findByIdAndUpdate(id, { isDeleted: true, deletedAt: new Date() }, { returnDocument: 'after' });
  }

  async bulkUpdateSortOrder(updates) {
    const ops = updates.map(({ id, sortOrder }) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder } } },
    }));
    return TaskList.bulkWrite(ops);
  }
}

const taskListRepository = new TaskListRepository();
export default taskListRepository;
