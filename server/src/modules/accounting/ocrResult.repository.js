import OcrResult from './ocrResult.model.js';

class OcrResultRepository {
  async create(data) {
    const result = new OcrResult(data);
    return result.save();
  }

  async findByDocumentId(documentId) {
    return OcrResult.findOne({ documentId }).lean();
  }

  async updateStatus(documentId, status, additionalData = {}) {
    return OcrResult.findOneAndUpdate(
      { documentId },
      { status, ...additionalData },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }
}

const ocrResultRepository = new OcrResultRepository();
export default ocrResultRepository;
