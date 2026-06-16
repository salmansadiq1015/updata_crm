import quotationTemplateService from './quotationTemplate.service.js';

class QuotationTemplateController {
  async list(req, res, next) {
    try {
      const { search, category, isActive, limit } = req.query;
      const data = await quotationTemplateService.list({
        search: search || undefined,
        category: category || undefined,
        isActive: isActive !== undefined ? isActive === 'true' || isActive === true : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async listCategories(req, res, next) {
    try {
      const data = await quotationTemplateService.listCategories();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const data = await quotationTemplateService.getById(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const data = await quotationTemplateService.create(req.body, req.user._id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const data = await quotationTemplateService.update(req.params.id, req.body, req.user._id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      await quotationTemplateService.remove(req.params.id, req.user._id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async incrementUsage(req, res, next) {
    try {
      await quotationTemplateService.incrementUsage(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}

export default new QuotationTemplateController();
