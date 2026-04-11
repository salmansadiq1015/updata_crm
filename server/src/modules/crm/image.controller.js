import entityImageService from './entityImage.service.js';

class ImageController {
  async listByEntity(req, res, next) {
    try {
      const images = await entityImageService.listByEntity(req.entityType, req.params.id);
      return res.success({ data: images });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { buffer, originalname, mimetype, size } = req.file;
      const fileData = {
        buffer,
        originalName: originalname,
        mimeType: mimetype,
        sizeBytes: size,
        caption: req.body.caption,
        category: req.body.category,
        sortOrder: req.body.sortOrder,
      };
      const image = await entityImageService.create(req.entityType, req.params.id, fileData, req.user._id, meta);
      return res.success({ data: image, message: 'Image uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await entityImageService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Image deleted successfully' });
    } catch (err) { next(err); }
  }
}

const imageController = new ImageController();
export default imageController;
