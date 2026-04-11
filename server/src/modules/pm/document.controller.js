import documentService from './document.service.js';

class DocumentController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const docs = await documentService.listByProject(req.params.id, { category: query.category });
      return res.success({ data: docs });
    } catch (err) { next(err); }
  }

  async upload(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { buffer, originalname, mimetype, size } = req.file;
      const fileData = {
        buffer,
        originalName: originalname,
        mimeType: mimetype,
        sizeBytes: size,
        category: req.body.category,
        description: req.body.description,
      };
      const doc = await documentService.upload(req.params.id, fileData, req.user._id, meta);
      return res.success({ data: doc, message: 'Document uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const doc = await documentService.getById(req.params.docId);
      return res.success({ data: doc });
    } catch (err) { next(err); }
  }

  async download(req, res, next) {
    try {
      const url = await documentService.getDownloadUrl(req.params.docId);
      return res.success({ data: { url } });
    } catch (err) { next(err); }
  }

  async updateMetadata(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await documentService.updateMetadata(req.params.docId, req.body, req.user._id, meta);
      return res.success({ data: doc, message: 'Document metadata updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await documentService.delete(req.params.docId, req.user._id, meta);
      return res.success({ message: 'Document deleted successfully' });
    } catch (err) { next(err); }
  }

  async generate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await documentService.generate(req.params.id, req.body.templateType, req.user._id, meta);
      return res.success({ data: doc, message: 'Document generated successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }
}

const documentController = new DocumentController();
export default documentController;
