import ProjectDocument from './projectDocument.model.js';

class DocumentRepository {
  async create(data) {
    const doc = new ProjectDocument(data);
    return doc.save();
  }

  async findById(id) {
    return ProjectDocument.findById(id).lean();
  }

  async findByProjectId(projectId, { category } = {}) {
    const filter = { projectId };
    if (category) {
      filter.category = category;
    }
    return ProjectDocument.find(filter)
      .sort({ createdAt: -1 })
      .lean();
  }

  async updateById(id, data) {
    return ProjectDocument.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
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
