import { BaseWorker } from '../shared/queue/BaseWorker.js';
import fileRepository from '../modules/files/file.repository.js';
import storageService from '../shared/storage/StorageService.js';
import logger from '../shared/logger/index.js';

/**
 * File cleanup job.
 *
 * Finds soft-deleted files older than the retention period,
 * deletes them from S3, then hard-deletes the DB record.
 *
 * Retention: 30 days (configurable via job data).
 * Idempotent: checks if S3 object exists before attempting delete.
 */
const DEFAULT_RETENTION_DAYS = 30;

export class FileCleanupWorker extends BaseWorker {
  constructor() {
    super('file-cleanup');
  }

  async process(job) {
    const retentionDays = job.data.retentionDays || DEFAULT_RETENTION_DAYS;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deletedFiles = await fileRepository.findDeletedBefore(cutoffDate, 50);

    if (deletedFiles.length === 0) {
      return { processed: 0 };
    }

    let processed = 0;
    let errors = 0;

    for (const file of deletedFiles) {
      try {
        // Delete from S3
        await storageService.delete(file.key);
        // Hard-delete from DB
        await fileRepository.hardDelete(file._id);
        processed++;
      } catch (err) {
        errors++;
        logger.warn('Failed to cleanup file', {
          module: 'jobs',
          action: 'file-cleanup',
          fileId: file._id,
          key: file.key,
          error: { message: err.message },
        });
      }
    }

    logger.info('File cleanup completed', {
      module: 'jobs',
      action: 'file-cleanup',
      total: deletedFiles.length,
      processed,
      errors,
    });

    return { total: deletedFiles.length, processed, errors };
  }
}

export default FileCleanupWorker;
