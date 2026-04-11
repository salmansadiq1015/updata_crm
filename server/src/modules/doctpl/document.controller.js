import crypto from 'crypto';
import generatedDocumentRepository from './generatedDocument.repository.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

class DocumentController {
  async generate(req, res, next) {
    try {
      const { default: documentGenerationService } = await import('./documentGeneration.service.js');
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await documentGenerationService.generate({
        ...req.body,
        generatedBy: req.user._id,
        meta,
      });
      return res.success({ data: doc, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async generateBatch(req, res, next) {
    try {
      const { default: queueManager } = await import('../../shared/queue/QueueManager.js');
      const batchId = crypto.randomUUID();
      await queueManager.addJob('document-generation', `batch-${batchId}`, {
        items: req.body.items,
        generatedBy: req.user._id,
        meta: { ipAddress: req.ip, userAgent: req.get('user-agent') },
      });
      return res.success({
        data: {
          batchId,
          itemCount: req.body.items.length,
          status: 'QUEUED',
        },
        statusCode: 201,
      });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await generatedDocumentRepository.findWithCursor(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async listBySource(req, res, next) {
    try {
      const { sourceModule, sourceRecordId } = req.params;
      const docs = await generatedDocumentRepository.findBySource(sourceModule, sourceRecordId);
      return res.success({ data: docs });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const doc = await generatedDocumentRepository.findById(req.params.id);
      if (!doc) throw new NotFoundError('GeneratedDocument', req.params.id);
      return res.success({ data: doc });
    } catch (err) { next(err); }
  }

  async download(req, res, next) {
    try {
      const doc = await generatedDocumentRepository.findById(req.params.id);
      if (!doc) throw new NotFoundError('GeneratedDocument', req.params.id);

      const { default: fileService } = await import('../files/file.service.js');
      const downloadUrl = await fileService.getDownloadUrl(doc.fileId);
      return res.success({ data: { downloadUrl } });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const doc = await generatedDocumentRepository.findById(req.params.id);
      if (!doc) throw new NotFoundError('GeneratedDocument', req.params.id);

      const { default: fileService } = await import('../files/file.service.js');
      await fileService.delete(doc.fileId);
      await generatedDocumentRepository.deleteById(req.params.id);

      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      auditService.logEvent({
        eventType: 'document.deleted',
        userId: req.user._id,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'success',
        details: { documentId: req.params.id, fileName: doc.fileName },
        module: 'doctpl',
      });

      return res.success({ message: 'Document deleted successfully' });
    } catch (err) { next(err); }
  }
}

const documentController = new DocumentController();
export default documentController;
