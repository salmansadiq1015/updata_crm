import pickerService from './picker.service.js';

class PickerController {
  async searchArticles(req, res, next) {
    try {
      const { q, categoryId, type, source, limit } = req._validatedQuery || req.query;
      const data = await pickerService.searchArticles(q, { categoryId, type, source, limit });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async searchTextBlocks(req, res, next) {
    try {
      const { q, categoryId, limit } = req._validatedQuery || req.query;
      const data = await pickerService.searchTextBlocks(q, { categoryId, limit });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async lookupBarcode(req, res, next) {
    try {
      const data = await pickerService.lookupBarcode(req.body.code);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async recordArticleUse(req, res, next) {
    try {
      const { id } = req.params;
      await pickerService.recordArticleUse(id);
      return res.success({ data: null });
    } catch (err) { next(err); }
  }
}

const pickerController = new PickerController();
export default pickerController;
