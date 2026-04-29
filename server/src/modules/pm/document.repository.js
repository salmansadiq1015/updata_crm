import ProjectDocument from './projectDocument.model.js';

const POPULATE_FIELDS = [
  { path: 'fileId', select: 'originalName mimeType sizeBytes' },
  { path: 'uploadedBy', select: 'firstName lastName' },
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

  async findByProjectId(projectId, { category, search, startDate, endDate } = {}) {
    const filter = { projectId };
    if (category) filter.category = category;
    if (search) filter.fileName = { $regex: search, $options: 'i' };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    return ProjectDocument.find(filter)
      .populate(POPULATE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
  }

  async updateById(id, data) {
    return ProjectDocument.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return ProjectDocument.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async restore(id) {
    return ProjectDocument.findByIdAndUpdate(
      id,
      { isDeleted: false, deletedAt: null },
      { new: true },
    ).setOptions({ includeDeleted: true });
  }
}

const documentRepository = new DocumentRepository();
export default documentRepository;
