import ProjectDocument from './projectDocument.model.js';

const POPULATE_FIELDS = [
  { path: 'fileId', select: 'originalName mimeType sizeBytes' },
  { path: 'uploadedBy', select: 'firstName lastName' },
  { path: 'visumBy', select: 'firstName lastName' },
];

class DocumentRepository {
  async create(data) {
    const doc = new ProjectDocument(data);
    return doc.save();
  }

  async findById(id) {
    return ProjectDocument.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findByProjectId(projectId, {
    category, search, startDate, endDate, includeDeleted = false,
  } = {}) {
    const filter = { projectId };
    if (category) filter.category = category;
    if (search) filter.fileName = { $regex: search, $options: 'i' };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    const query = ProjectDocument.find(filter)
      .populate(POPULATE_FIELDS)
      .sort({ createdAt: -1 });
    // When includeDeleted is set, bypass the soft-delete pre-hook so the
    // "Include Deleted" view can surface restorable documents (PROJ-006 AC-6).
    if (includeDeleted) query.setOptions({ includeDeleted: true });
    return query.lean();
  }

  async findLatestByFileName(projectId, fileName) {
    return ProjectDocument.findOne({ projectId, fileName })
      .sort({ version: -1 })
      .lean();
  }

  async updateById(id, data) {
    return ProjectDocument.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return ProjectDocument.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async restore(id) {
    return ProjectDocument.findByIdAndUpdate(
      id,
      { isDeleted: false, deletedAt: null },
      { returnDocument: 'after' },
    ).setOptions({ includeDeleted: true });
  }
}

const documentRepository = new DocumentRepository();
export default documentRepository;
