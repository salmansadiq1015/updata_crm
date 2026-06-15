import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Document generation batch job.
 *
 * Processes a batch of document generation requests.
 * Each item is generated independently — failures do not block other items.
 */
export class DocumentGenerationWorker extends BaseWorker {
  constructor() {
    super('document-generation');
  }

  async process(job) {
    const { batchId, items, generatedBy, meta } = job.data;
    const results = [];
    let succeeded = 0;
    let failed = 0;

    const { default: documentGenerationService } = await import('../modules/doctpl/documentGeneration.service.js');
    const { default: documentGenerationBatchRepository } = await import('../modules/doctpl/documentGenerationBatch.repository.js');

    if (batchId) {
      await documentGenerationBatchRepository.markProcessing(batchId);
    }

    for (const [index, item] of items.entries()) {
      try {
        if (batchId) {
          await documentGenerationBatchRepository.markItemProcessing(batchId, index);
        }
        const doc = await documentGenerationService.generate({
          templateType: item.templateType,
          sourceModule: item.sourceModule,
          sourceRecordId: item.sourceRecordId,
          data: item.data,
          language: item.language || 'de',
          generatedBy,
          meta,
        });
        results.push({ sourceRecordId: item.sourceRecordId, status: 'SUCCESS', documentId: doc._id });
        if (batchId) {
          await documentGenerationBatchRepository.markItemSuccess(batchId, index, doc._id);
        }
        succeeded++;
      } catch (err) {
        results.push({ sourceRecordId: item.sourceRecordId, status: 'FAILED', error: err.message });
        if (batchId) {
          await documentGenerationBatchRepository.markItemFailed(batchId, index, err.message);
        }
        failed++;
        logger.error('Document generation failed for item', {
          module: 'jobs',
          action: 'document-generation',
          sourceRecordId: item.sourceRecordId,
          error: { message: err.message, stack: err.stack },
        });
      }
    }

    logger.info('Document generation batch completed', {
      module: 'jobs',
      action: 'document-generation',
      total: items.length,
      succeeded,
      failed,
    });

    if (batchId) {
      await documentGenerationBatchRepository.complete(batchId, { succeeded, failed });
    }

    return { total: items.length, succeeded, failed, results };
  }
}

export default DocumentGenerationWorker;
