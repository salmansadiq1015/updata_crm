import photoService from './photo.service.js';

class PhotoController {
  async upload(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const orderId = req.params.id;
      const fileData = {
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      };
      const metadata = {
        workReportId: req.body.workReportId || null,
        category: req.body.category,
        caption: req.body.caption || null,
        hasAnnotations: req.body.hasAnnotations === 'true' || req.body.hasAnnotations === true,
        annotationData: req.body.annotationData || null,
        latitude: req.body.latitude ? Number(req.body.latitude) : null,
        longitude: req.body.longitude ? Number(req.body.longitude) : null,
        capturedAt: req.body.capturedAt || new Date(),
      };
      const photo = await photoService.upload(orderId, fileData, metadata, req.user._id, meta);
      return res.success({ data: photo, message: 'Photo uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listByOrder(req, res, next) {
    try {
      const data = await photoService.listByOrder(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await photoService.delete(req.params.photoId, req.user._id, meta);
      return res.success({ message: 'Photo deleted successfully' });
    } catch (err) { next(err); }
  }
}

const photoController = new PhotoController();
export default photoController;
