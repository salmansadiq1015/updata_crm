// server/src/modules/crm/attachment.controller.js
import fileService from '../files/file.service.js';
import FileMetadata from '../files/file.model.js';
import storageService from '../../shared/storage/StorageService.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

class AttachmentController {
  async list(req, res, next) {
    try {
      const { limit = 15 } = req._validatedQuery || {};
      const files = await FileMetadata.find({
        module: 'crm',
        entityType: 'customer',
        entityId: req.params.id,
      })
        .populate('uploadedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(Math.min(Number(limit), 50))
        .select('-__v')
        .lean();
      return res.success({ data: files });
    } catch (err) { next(err); }
  }

  async upload(req, res, next) {
    try {
      if (!req.file) {
        return res.fail({ statusCode: 400, code: 'FILE_REQUIRED', message: 'No file provided' });
      }
      const { buffer, originalname, mimetype, size } = req.file;
      const result = await fileService.upload({
        buffer,
        originalName: originalname,
        mimeType: mimetype,
        sizeBytes: size,
        module: 'crm',
        entityType: 'customer',
        entityId: req.params.id,
        uploadedBy: req.user._id,
        bucket: 'documents',
      });

      let url = null;
      try {
        url = await storageService.getPresignedUrl(result.key, 7 * 24 * 3600);
      } catch { /* non-fatal */ }

      return res.success({ data: { ...result.toObject(), url }, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async rename(req, res, next) {
    try {
      const { id: customerId, fileId } = req.params;
      const file = await FileMetadata.findById(fileId);
      if (!file) throw new NotFoundError('File', fileId);
      if (file.entityId?.toString() !== customerId) {
        return res.fail({ statusCode: 403, code: 'FORBIDDEN', message: 'File does not belong to this customer' });
      }
      file.originalName = req.body.originalName;
      await file.save();
      const { __v, ...fileData } = file.toObject();
      return res.success({ data: fileData, message: 'File renamed' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const { id: customerId, fileId } = req.params;
      const file = await FileMetadata.findById(fileId);
      if (!file) throw new NotFoundError('File', fileId);
      if (file.entityId?.toString() !== customerId) {
        return res.fail({ statusCode: 403, code: 'FORBIDDEN', message: 'File does not belong to this customer' });
      }
      await fileService.delete(fileId);
      return res.success({ message: 'File deleted' });
    } catch (err) { next(err); }
  }

  async bulkRemove(req, res, next) {
    try {
      const { id: customerId } = req.params;
      const { fileIds } = req.body;
      let deleted = 0;
      const errors = [];

      await Promise.all(
        fileIds.map(async (fileId) => {
          const file = await FileMetadata.findById(fileId);
          if (!file || file.entityId?.toString() !== customerId) {
            logger.warn('bulkRemove: file not found or ownership mismatch', {
              module: 'crm',
              action: 'bulkRemove',
              fileId,
              requestedBy: req.user?._id,
            });
            return;
          }
          try {
            await fileService.delete(fileId);
            deleted++;
          } catch (err) {
            errors.push({ fileId, error: err.message });
          }
        }),
      );

      return res.success({
        data: { deleted, ...(errors.length ? { errors } : {}) },
        message: `${deleted} file(s) deleted`,
      });
    } catch (err) { next(err); }
  }
}

const attachmentController = new AttachmentController();
export default attachmentController;
