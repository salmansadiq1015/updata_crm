import PreparatoryAction from './preparatoryAction.model.js';

class PrepActionRepository {
  async create(data) {
    const action = new PreparatoryAction(data);
    return action.save();
  }

  async findById(id) {
    return PreparatoryAction.findById(id).lean();
  }

  async findByProjectId(projectId) {
    return PreparatoryAction.find({ projectId })
      .sort({ dueDate: 1 })
      .lean();
  }

  async updateById(id, data) {
    return PreparatoryAction.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return PreparatoryAction.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async countMandatoryIncomplete(projectId) {
    return PreparatoryAction.countDocuments({
      projectId,
      isMandatory: true,
      status: { $nin: ['COMPLETED'] },
      isDeleted: false,
    });
  }

  async findOverdue(limit = 500) {
    return PreparatoryAction.find({
      dueDate: { $lte: new Date() },
      status: { $nin: ['COMPLETED', 'REJECTED', 'CANCELLED'] },
      isDeleted: false,
    })
      .limit(limit)
      .lean();
  }
}

const prepActionRepository = new PrepActionRepository();
export default prepActionRepository;
