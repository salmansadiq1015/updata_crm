import logger from '../../shared/logger/index.js';

class DocumentController {
  /**
   * If the order belongs to a project, create a ProjectDocument referencing the
   * same stored file so the mobile document appears in the PM Documents tab.
   * Best-effort: any failure is logged and swallowed so the mobile upload succeeds.
   */
  async _linkToProjectRepository(orderId, fileId, fileName, userId, meta = {}) {
    try {
      const { default: Order } = await import('../qop/order.model.js');
      const order = await Order.findById(orderId).select('projectId').lean();
      if (!order || !order.projectId) return;

      const { default: documentService } = await import('../pm/document.service.js');
      await documentService.createFromStoredFile(order.projectId, {
        fileId,
        fileName: fileName || 'document',
        category: 'OTHER',
        uploadedBy: userId,
      }, meta);
    } catch (err) {
      logger.warn('Failed to link mobile document to project repository', {
        module: 'mobile', action: 'document.linkProject', orderId, error: err.message,
      });
    }
  }

  async listDocuments(req, res, next) {
    try {
      const { default: fileService } = await import('../files/file.service.js');
      const orderId = req.params.id;
      const { default: generatedDocumentRepository } = await import('../doctpl/generatedDocument.repository.js');

      const [uploadedFiles, generatedDocs] = await Promise.all([
        fileService.getByEntity('mobile', 'document', orderId),
        generatedDocumentRepository.findBySource('qop', orderId),
      ]);

      const uploaded = await Promise.all((uploadedFiles || []).map(async (file) => ({
        id: file._id,
        fileId: file._id,
        filename: file.originalName,
        name: file.originalName,
        file_size: file.sizeBytes,
        uploaded_at: file.createdAt,
        category: file.category || 'uploaded',
        mimeType: file.mimeType,
        source: 'upload',
        url: await this._safeDownloadUrl(fileService, file._id),
      })));

      const generated = await Promise.all((generatedDocs || []).map(async (doc) => ({
        id: doc.fileId,
        fileId: doc.fileId,
        generatedDocumentId: doc._id,
        filename: doc.fileName,
        name: doc.fileName,
        file_size: doc.fileSizeBytes,
        uploaded_at: doc.generatedAt,
        category: doc.documentType,
        mimeType: 'application/pdf',
        source: 'generated',
        url: await this._safeDownloadUrl(fileService, doc.fileId),
      })));

      return res.success({
        data: [...generated, ...uploaded].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0)),
      });
    } catch (err) { next(err); }
  }

  async downloadDocument(req, res, next) {
    try {
      const { default: fileService } = await import('../files/file.service.js');
      const url = await fileService.getDownloadUrl(req.params.docId);
      return res.success({ data: { url } });
    } catch (err) { next(err); }
  }

  async _safeDownloadUrl(fileService, fileId) {
    try {
      return await fileService.getDownloadUrl(fileId);
    } catch {
      return null;
    }
  }

  async uploadDocument(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file provided' });
      }
      const { default: fileService } = await import('../files/file.service.js');
      const fileData = {
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      };
      const file = await fileService.upload(fileData, {
        module: 'mobile',
        entityType: 'document',
        entityId: req.params.id,
        uploadedBy: req.user._id,
      });

      // Additive: if the order belongs to a project, also surface this document in
      // the PM Documents tab. Best-effort — never blocks the mobile upload.
      await this._linkToProjectRepository(
        req.params.id,
        file._id,
        req.file.originalname,
        req.user._id,
        { ipAddress: req.ip, userAgent: req.get('user-agent') },
      );

      return res.success({ data: file, message: 'Document uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }
}

const documentController = new DocumentController();
export default documentController;
