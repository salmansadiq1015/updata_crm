import articleService from './article.service.js';

class ArticleController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const article = await articleService.create(req.body, req.user._id, meta);
      return res.success({ data: article, message: 'Article created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getFacets(req, res, next) {
    try {
      const { categoryId, q } = req.query;
      const facets = await articleService.getFacets({ categoryId, q });
      return res.success({ data: facets });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await articleService.list(query, {
        userId: req.user?._id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        surface: 'articles',
      });
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const article = await articleService.getById(req.params.id);
      return res.success({ data: article });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const article = await articleService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: article, message: 'Article updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await articleService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Article deleted successfully' });
    } catch (err) { next(err); }
  }

  async bulkImport(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await articleService.bulkImport(req.file, req.body.format, req.user._id, meta);
      return res.success({ data: result, message: 'Import job queued', statusCode: 202 });
    } catch (err) { next(err); }
  }

  async importTemplate(req, res, next) {
    try {
      const csv = articleService.importTemplate();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="catalog-article-import-template.csv"');
      return res.status(200).send(csv);
    } catch (err) { next(err); }
  }

  async getVersions(req, res, next) {
    try {
      const data = await articleService.getVersions(req.params.id, req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getVersion(req, res, next) {
    try {
      const data = await articleService.getVersion(req.params.id, Number(req.params.ver));
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const articleController = new ArticleController();
export default articleController;
