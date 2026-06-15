import crypto from 'crypto';
import generatedDocumentRepository from './generatedDocument.repository.js';
import documentGenerationBatchRepository from './documentGenerationBatch.repository.js';
import documentAccessPolicyService from './documentAccessPolicy.service.js';
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
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await documentGenerationBatchRepository.create({
        batchId,
        items: req.body.items,
        createdBy: req.user._id,
        meta,
      });
      await queueManager.addJob('document-generation', `batch-${batchId}`, {
        batchId,
        items: req.body.items,
        generatedBy: req.user._id,
        meta,
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

  async getBatchStatus(req, res, next) {
    try {
      const batch = await documentGenerationBatchRepository.findByBatchId(req.params.batchId);
      if (!batch) throw new NotFoundError('DocumentGenerationBatch', req.params.batchId);
      return res.success({ data: batch });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await generatedDocumentRepository.findWithCursor(query);
      const visibleDocs = [];
      for (const doc of result.data) {
        if (await documentAccessPolicyService.canRead(doc, req.user)) visibleDocs.push(doc);
      }
      return res.success({ data: visibleDocs, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async listBySource(req, res, next) {
    try {
      const { sourceModule, sourceRecordId } = req.params;
      const docs = await generatedDocumentRepository.findBySource(sourceModule, sourceRecordId);
      const visibleDocs = [];
      for (const doc of docs) {
        if (await documentAccessPolicyService.canRead(doc, req.user)) visibleDocs.push(doc);
      }
      return res.success({ data: visibleDocs });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const doc = await generatedDocumentRepository.findById(req.params.id);
      if (!doc) throw new NotFoundError('GeneratedDocument', req.params.id);
      await documentAccessPolicyService.assertCanRead(doc, req.user);
      return res.success({ data: doc });
    } catch (err) { next(err); }
  }

  async download(req, res, next) {
    try {
      const doc = await generatedDocumentRepository.findById(req.params.id);
      if (!doc) throw new NotFoundError('GeneratedDocument', req.params.id);
      await documentAccessPolicyService.assertCanRead(doc, req.user);

      const { default: fileService } = await import('../files/file.service.js');
      const downloadUrl = await fileService.getDownloadUrl(doc.fileId);
      return res.success({ data: { downloadUrl } });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const doc = await generatedDocumentRepository.findById(req.params.id);
      if (!doc) throw new NotFoundError('GeneratedDocument', req.params.id);
      await documentAccessPolicyService.assertCanDelete(doc, req.user);

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
