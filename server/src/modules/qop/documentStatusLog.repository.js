import DocumentStatusLog from './documentStatusLog.model.js';

class DocumentStatusLogRepository {
  async create(data) {
    const log = new DocumentStatusLog(data);
    return log.save();
  }

  async findByDocument(documentType, documentId) {
    return DocumentStatusLog.find({ documentType, documentId })
      .sort({ changedAt: -1 })
      .populate('changedBy', 'firstName lastName')
      .lean();
  }
}

const documentStatusLogRepository = new DocumentStatusLogRepository();
export default documentStatusLogRepository;
