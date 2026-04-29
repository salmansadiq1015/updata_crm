import fileService from './file.service.js';
import storageService from '../../shared/storage/StorageService.js';

/**
 * File controller — HTTP layer only.
 * Parses request, calls service, formats response.
 * ZERO business logic here.
 */
class FileController {
  async upload(req, res, next) {
    try {
      if (!req.file) {
        return res.fail({
          statusCode: 400,
          code: 'FILE_REQUIRED',
          message: 'No file provided in the request',
        });
      }

      const result = await fileService.upload({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        module: req.body.module,
        entityType: req.body.entityType || null,
        entityId: req.body.entityId || null,
        uploadedBy: req.user?._id || null,
        bucket: req.body.bucket || 'general',
      });

      // Generate a presigned URL so callers can immediately access the file
      let url = null;
      try {
        url = await storageService.getPresignedUrl(result.key, 7 * 24 * 3600); // 7-day expiry
      } catch {
        // Non-fatal — caller can fetch via /files/:id/download
      }

      return res.success({
        data: { ...result.toObject(), url },
        message: 'File uploaded successfully',
        statusCode: 201,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const file = await fileService.getById(req.params.id);
      if (!file) {
        return res.fail({ statusCode: 404, code: 'FILE_NOT_FOUND', message: 'File not found' });
      }
      return res.success({ data: file });
    } catch (err) {
      next(err);
    }
  }

  async download(req, res, next) {
    try {
      const url = await fileService.getDownloadUrl(req.params.id);
      return res.success({ data: { url } });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { cursor, limit, sortBy, sortOrder, ...filters } = query;
      const result = await fileService.list({ cursor, limit, sortBy, sortOrder, ...filters });
      return res.success({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      await fileService.delete(req.params.id);
      return res.success({ message: 'File deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
}

const fileController = new FileController();
export default fileController;
