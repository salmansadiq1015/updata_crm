class DocumentController {
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
      return res.success({ data: file, message: 'Document uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }
}

const documentController = new DocumentController();
export default documentController;
