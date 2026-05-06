import ConflictRecord from './conflictRecord.model.js';

class ConflictRepository {
  async create(data) {
    const record = new ConflictRecord(data);
    return record.save();
  }

  async findById(id) {
    return ConflictRecord.findById(id).lean();
  }

  async findByAssignment(assignmentId) {
    return ConflictRecord.find({ assignmentId }).lean();
  }

  async findActive() {
    return ConflictRecord.find({ resolved: false })
      .sort({ detectedAt: -1 })
      .lean();
  }

  async resolve(id, { resolvedBy, overrideReason }) {
    return ConflictRecord.findByIdAndUpdate(
      id,
      {
        $set: {
          resolved: true,
          resolvedBy,
          overrideReason,
        },
      },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async bulkCreate(records) {
    return ConflictRecord.insertMany(records);
  }
}

const conflictRepository = new ConflictRepository();
export default conflictRepository;
