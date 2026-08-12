import documentService from './document.service.js';
import { loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';

/**
 * Digitales Dossier: only holders of `project:documents:read:all` (office roles)
 * see the whole dossier. Everyone else — Monteure, Techniker — sees exactly what
 * the project lead released.
 */
async function releasedOnlyFor(user) {
  if (user?.role?.name === 'Admin') return false;
  const permissions = await loadUserPermissions(user);
  return !satisfiesPermission(permissions, 'project:documents:read:all');
}

class DocumentController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const releasedOnly = await releasedOnlyFor(req.user);
      const docs = await documentService.listByProject(req.params.id, {
        category: query.category,
        search: query.search,
        startDate: query.startDate,
        endDate: query.endDate,
        // The field never gets to browse deleted documents either.
        includeDeleted: releasedOnly ? false : query.includeDeleted,
        releasedOnly,
      });
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

  async setVisum(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const visiert = req.method !== 'DELETE';
      const doc = await documentService.setVisum(req.params.docId, req.user._id, visiert, meta);
      return res.success({ data: doc, message: visiert ? 'Document signed off' : 'Sign-off removed' });
    } catch (err) { next(err); }
  }

  // POST releases the document to the field, DELETE takes the release back.
  async setReleased(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const released = req.method === 'POST';
      const doc = await documentService.setReleased(req.params.docId, req.user._id, released, meta);
      return res.success({
        data: doc,
        message: released ? 'Document released to the field' : 'Document release revoked',
      });
    } catch (err) { next(err); }
  }

  async setArchived(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const archived = req.method !== 'DELETE';
      const doc = await documentService.setArchived(req.params.docId, req.user._id, archived, meta);
      return res.success({ data: doc, message: archived ? 'Document archived' : 'Document restored from archive' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await documentService.delete(req.params.docId, req.user._id, meta);
      return res.success({ message: 'Document deleted successfully' });
    } catch (err) { next(err); }
  }

  async restore(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await documentService.restore(req.params.docId, req.params.id, req.user._id, meta);
      return res.success({ data: doc, message: 'Document restored successfully' });
    } catch (err) { next(err); }
  }

  async generate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await documentService.generate(
        req.params.id,
        req.body.templateType,
        req.user._id,
        meta,
        req.body.overrides || {},
        req.body.draftId || null,
      );
      return res.success({ data: doc, message: 'Document generated successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async preview(req, res, next) {
    try {
      const data = await documentService.previewDocument(
        req.params.id,
        req.body.templateType,
        req.body.overrides || {},
      );
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async saveDraft(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await documentService.saveDraft(
        req.params.id,
        {
          templateType: req.body.templateType,
          overrides: req.body.overrides || {},
          draftId: req.body.draftId || null,
        },
        req.user._id,
        meta,
      );
      return res.success({ data: doc, message: 'Draft saved successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async email(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await documentService.emailDocument(
        req.params.docId,
        { to: req.body.to, message: req.body.message, projectId: req.params.id },
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Document emailed successfully' });
    } catch (err) { next(err); }
  }
}

const documentController = new DocumentController();
export default documentController;
