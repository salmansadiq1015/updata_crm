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
      const data = await fileService.find({
        $or: [
          { module: 'pm', entityId: orderId },
          { module: 'mobile', entityId: orderId },
        ],
      });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async downloadDocument(req, res, next) {
    try {
      const { default: fileService } = await import('../files/file.service.js');
      const url = await fileService.getDownloadUrl(req.params.docId);
      return res.success({ data: { url } });
    } catch (err) { next(err); }
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
