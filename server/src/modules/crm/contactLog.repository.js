import ContactLogEntry from './contactLog.model.js';

const POPULATE = [
  { path: 'employeeId', select: 'firstName lastName email avatarUrl' },
  { path: 'contactId', select: 'firstName lastName role email phone mobile' },
  { path: 'siteId', select: 'siteNumber name street postalCode city' },
  { path: 'projectId', select: 'name projectNumber status' },
  { path: 'orderId', select: 'orderNumber title status' },
  { path: 'assignmentId', select: 'assignmentNumber title status startDatetime' },
  { path: 'followUpTaskId', select: 'title status dueDate listId' },
];

class ContactLogRepository {
  async create(data) {
    const entry = new ContactLogEntry(data);
    await entry.save();
    return this.findById(entry._id);
  }

  async findById(id) {
    return ContactLogEntry.findById(id).populate(POPULATE).lean();
  }

  /** Raw document (no populate) — for ownership and edit-window checks. */
  async findRawById(id) {
    return ContactLogEntry.findById(id).lean();
  }

  /**
   * `filter` is already a Mongo filter built by the service, so the repository
   * stays free of policy: the customer view widens it, a linked record narrows it.
   */
  async find(filter, { limit = 100, skip = 0 } = {}) {
    return ContactLogEntry.find(filter)
      .populate(POPULATE)
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async count(filter) {
    return ContactLogEntry.countDocuments(filter);
  }

  async updateById(id, data) {
    await ContactLogEntry.findByIdAndUpdate(id, data, { runValidators: true });
    return this.findById(id);
  }

  async softDelete(id) {
    return ContactLogEntry.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }
}

const contactLogRepository = new ContactLogRepository();
export default contactLogRepository;
