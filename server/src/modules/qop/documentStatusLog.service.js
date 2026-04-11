import documentStatusLogRepository from './documentStatusLog.repository.js';

class DocumentStatusLogService {
  async logTransition(documentType, documentId, fromStatus, toStatus, changedBy, reason = null) {
    return documentStatusLogRepository.create({
      documentType,
      documentId,
      fromStatus,
      toStatus,
      changedBy,
      reason,
    });
  }

  async getHistory(documentType, documentId) {
    return documentStatusLogRepository.findByDocument(documentType, documentId);
  }
}

const documentStatusLogService = new DocumentStatusLogService();
export default documentStatusLogService;
