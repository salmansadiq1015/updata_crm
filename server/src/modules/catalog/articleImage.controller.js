import articleImageRepository from './articleImage.repository.js';
import fileService from '../files/file.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

/**
 * ArticleImage controller — HTTP layer for article image management.
 *
 * Upload flow:
 *   1. multer reads file into memory (req.file.buffer)
 *   2. fileService.upload() validates + pushes to S3 + creates FileMetadata record
 *   3. articleImageRepository.create() links the FileMetadata to the Article
 *
 * Delete flow:
 *   1. Look up images for the article and find the matching imageId
 *   2. Soft-delete the FileMetadata via fileService.delete() (best-effort)
 *   3. Hard-delete the ArticleImage join record
 */
class ArticleImageController {
  /**
   * GET /api/v1/catalog/articles/:articleId/images
   * Returns all images associated with the article, sorted by sortOrder.
   */
  async list(req, res, next) {
    try {
      const images = await articleImageRepository.findByArticleId(req.params.articleId);
      res.success({ data: images });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/catalog/articles/:articleId/images
   * Uploads a new image and associates it with the article.
   *
   * Expects multipart/form-data with field name 'image'.
   * Optional body field: sortOrder (integer, defaults to 0).
   */
  async upload(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file provided' });
      }

      const { articleId } = req.params;
      const sortOrder = Number(req.body?.sortOrder ?? 0);

      // 1. Upload file to S3 via shared file service — creates FileMetadata
      const fileMetadata = await fileService.upload({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        module: 'catalog',
        entityType: 'article',
        entityId: articleId,
        uploadedBy: req.user._id,
        bucket: 'images',
      });

      // 2. Create the ArticleImage join record
      const image = await articleImageRepository.create({
        articleId,
        fileId: fileMetadata._id,
        sortOrder,
      });

      return res.status(201).json({ success: true, data: image });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/catalog/articles/:articleId/images/:imageId
   * Removes an image from the article.
   *
   * articleImageRepository has no findById — we load all images for the article
   * and find the matching one, which also verifies article ownership.
   */
  async remove(req, res, next) {
    try {
      const { articleId, imageId } = req.params;

      // Load images for article and find the target (also confirms article ownership)
      const images = await articleImageRepository.findByArticleId(articleId);
      const image = images.find((img) => img._id.toString() === imageId);

      if (!image) {
        throw new NotFoundError('ArticleImage', imageId);
      }

      // Delete the FileMetadata (soft-delete via file service) — best-effort
      try {
        await fileService.delete(image.fileId.toString());
      } catch (_) {
        // Storage/service delete is best-effort; don't fail the request
      }

      // Remove the join record
      await articleImageRepository.deleteById(imageId);

      return res.success({ data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }
}

export default new ArticleImageController();
