import openItemsService from './openItems.service.js';

class OpenItemsController {
  async getOpenItems(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await openItemsService.getOpenItems(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getAging(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await openItemsService.getAging(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async generateStatement(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await openItemsService.generateStatement(
        req.params.entityId,
        query.entityType,
        { dateFrom: query.dateFrom, dateTo: query.dateTo },
      );
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getNetPosition(req, res, next) {
    try {
      const data = await openItemsService.getNetPosition(req.params.entityId);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const openItemsController = new OpenItemsController();
export default openItemsController;
