import catalogMarkupRuleService from './catalogMarkupRule.service.js';

class CatalogMarkupRuleController {
  async create(req, res, next) {
    try {
      const rule = await catalogMarkupRuleService.create(
        req.body,
        req.user._id,
        { ipAddress: req.ip, userAgent: req.get('user-agent') },
      );
      return res.success({ data: rule, message: 'Catalog markup rule created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const result = await catalogMarkupRuleService.list(req._validatedQuery || req.query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const rule = await catalogMarkupRuleService.getById(req.params.id);
      return res.success({ data: rule });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const rule = await catalogMarkupRuleService.update(
        req.params.id,
        req.body,
        req.user._id,
        { ipAddress: req.ip, userAgent: req.get('user-agent') },
      );
      return res.success({ data: rule, message: 'Catalog markup rule updated' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      await catalogMarkupRuleService.delete(
        req.params.id,
        req.user._id,
        { ipAddress: req.ip, userAgent: req.get('user-agent') },
      );
      return res.success({ message: 'Catalog markup rule deleted' });
    } catch (err) { next(err); }
  }

  async resolve(req, res, next) {
    try {
      let article = req.body.article;
      if (req.body.articleId) {
        const articleRepository = (await import('./article.repository.js')).default;
        article = await articleRepository.findById(req.body.articleId);
      }
      const result = await catalogMarkupRuleService.resolveForArticle(article || {});
      return res.success({ data: result });
    } catch (err) { next(err); }
  }
}

const catalogMarkupRuleController = new CatalogMarkupRuleController();
export default catalogMarkupRuleController;
