import DocumentGenerationBatch from './documentGenerationBatch.model.js';

class DocumentGenerationBatchRepository {
  async create({ batchId, items, createdBy, meta = {} }) {
    const batch = new DocumentGenerationBatch({
      batchId,
      total: items.length,
      items: items.map((item, index) => ({
        index,
        templateType: item.templateType,
        sourceModule: item.sourceModule,
        sourceRecordId: item.sourceRecordId,
        language: item.language || 'de',
        status: 'QUEUED',
      })),
      createdBy,
      meta,
    });
    return batch.save();
  }

  async findByBatchId(batchId) {
    return DocumentGenerationBatch.findOne({ batchId }).lean();
  }

  async markProcessing(batchId) {
    return DocumentGenerationBatch.findOneAndUpdate(
      { batchId },
      { $set: { status: 'PROCESSING', startedAt: new Date() } },
      { new: true },
    ).lean();
  }

  async markItemProcessing(batchId, index) {
    return DocumentGenerationBatch.updateOne(
      { batchId, 'items.index': index },
      {
        $set: {
          'items.$.status': 'PROCESSING',
          'items.$.startedAt': new Date(),
          'items.$.error': '',
        },
      },
    );
  }

  async markItemSuccess(batchId, index, documentId) {
    return DocumentGenerationBatch.updateOne(
      { batchId, 'items.index': index },
      {
        $set: {
          'items.$.status': 'SUCCESS',
          'items.$.documentId': documentId,
          'items.$.completedAt': new Date(),
          'items.$.error': '',
        },
        $inc: { succeeded: 1 },
      },
    );
  }

  async markItemFailed(batchId, index, error) {
    return DocumentGenerationBatch.updateOne(
      { batchId, 'items.index': index },
      {
        $set: {
          'items.$.status': 'FAILED',
          'items.$.error': `${error || 'Document generation failed'}`.slice(0, 2000),
          'items.$.completedAt': new Date(),
        },
        $inc: { failed: 1 },
      },
    );
  }

  async complete(batchId, { succeeded, failed }) {
    const status = failed === 0 ? 'COMPLETED' : succeeded > 0 ? 'PARTIAL_FAILED' : 'FAILED';
    return DocumentGenerationBatch.findOneAndUpdate(
      { batchId },
      {
        $set: {
          status,
          succeeded,
          failed,
          completedAt: new Date(),
        },
      },
      { new: true },
    ).lean();
  }
}

const documentGenerationBatchRepository = new DocumentGenerationBatchRepository();
export default documentGenerationBatchRepository;
