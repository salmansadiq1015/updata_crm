import documentIndexService from './documentIndex.service.js';

class DocumentIndexController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await documentIndexService.list(query, req.user);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  // Attachable documents across the repository, generated and project documents.
  async listAttachable(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await documentIndexService.listAttachable(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async upload(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await documentIndexService.upload(req.file, req.body, req.user, meta);
      return res.success({ data: doc, message: 'Document uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async download(req, res, next) {
    try {
      const attachment = req.query.attachment === '1' || req.query.attachment === 'true';
      const data = await documentIndexService.download(req.params.id, req.user, { attachment });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async setArchived(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const archived = req.method !== 'DELETE';
      const doc = await documentIndexService.setArchived(req.params.id, req.user, archived, meta);
      return res.success({ data: doc, message: archived ? 'Document archived' : 'Document restored from archive' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await documentIndexService.delete(req.params.id, req.user, meta);
      return res.success({ data, message: 'Document deleted successfully' });
    } catch (err) { next(err); }
  }
}

const documentIndexController = new DocumentIndexController();
export default documentIndexController;
