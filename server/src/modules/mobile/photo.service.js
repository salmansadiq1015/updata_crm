import mobilePhotoRepository from './mobilePhoto.repository.js';
import auditService from '../auth/audit.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

class PhotoService {
  async upload(orderId, fileData, metadata, userId, meta = {}) {
    const { default: fileService } = await import('../files/file.service.js');

    const fileResult = await fileService.upload({
      buffer: fileData.buffer,
      originalName: fileData.originalName,
      mimeType: fileData.mimeType,
      sizeBytes: fileData.sizeBytes,
      module: 'mobile',
      entityType: 'photo',
      entityId: orderId,
      uploadedBy: userId,
      bucket: 'images',
    });

    const photo = await mobilePhotoRepository.create({
      orderId,
      workReportId: metadata.workReportId || null,
      fileId: fileResult._id,
      category: metadata.category,
      caption: metadata.caption || null,
      hasAnnotations: metadata.hasAnnotations || false,
      annotationData: metadata.annotationData || null,
      latitude: metadata.latitude || null,
      longitude: metadata.longitude || null,
      capturedAt: metadata.capturedAt,
      uploadedBy: userId,
    });

    // Additive: if the order belongs to a project, also surface the photo in the
    // PM Documents tab as a ProjectDocument. Best-effort — never blocks the upload.
    await this._linkToProjectRepository(orderId, fileResult._id, fileData.originalName, userId, meta);

    eventBus.publish(EVENT_TYPES.MOBILE_PHOTO_UPLOADED, {
      photoId: photo._id,
      orderId,
      category: metadata.category,
      uploadedBy: userId,
    }, { source: 'mobile:photos' });

    auditService.logEvent({
      eventType: 'mobile.photo.uploaded',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { photoId: photo._id, orderId, category: metadata.category },
      module: 'mobile',
    });

    logger.info('Mobile photo uploaded', { module: 'mobile', action: 'photo.upload', photoId: photo._id, orderId });

    return photo;
  }

  /**
   * If the order belongs to a project, create a ProjectDocument referencing the
   * same stored file so the mobile photo appears in the PM Documents tab.
   * Best-effort: any failure is logged and swallowed so the mobile upload succeeds.
   */
  async _linkToProjectRepository(orderId, fileId, fileName, userId, meta = {}) {
    try {
      const Order = (await import('../qop/order.model.js')).default;
      const order = await Order.findById(orderId).select('projectId').lean();
      if (!order || !order.projectId) return;

      const { default: documentService } = await import('../pm/document.service.js');
      await documentService.createFromStoredFile(order.projectId, {
        fileId,
        fileName: fileName || 'photo',
        category: 'PHOTOS',
        uploadedBy: userId,
      }, meta);
    } catch (err) {
      logger.warn('Failed to link mobile photo to project repository', {
        module: 'mobile', action: 'photo.linkProject', orderId, error: err.message,
      });
    }
  }

  async listByOrder(orderId) {
    return mobilePhotoRepository.findByOrderId(orderId);
  }

  async delete(id, userId, meta = {}) {
    const photo = await mobilePhotoRepository.findById(id);
    if (!photo) throw new NotFoundError('MobilePhoto', id);

    const { default: fileService } = await import('../files/file.service.js');
    await fileService.delete(photo.fileId);

    await mobilePhotoRepository.deleteById(id);

    auditService.logEvent({
      eventType: 'mobile.photo.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { photoId: id, orderId: photo.orderId },
      module: 'mobile',
    });

    logger.info('Mobile photo deleted', { module: 'mobile', action: 'photo.delete', photoId: id });
  }
}

const photoService = new PhotoService();
export default photoService;
