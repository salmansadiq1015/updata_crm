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
      const body = req._validatedBody || req.body || {};
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const dateRange = { dateFrom: query.dateFrom, dateTo: query.dateTo };
      const outputOptions = {
        sendEmail: body.sendEmail === true,
        recipientEmail: body.recipientEmail,
      };
      const data = body.format === 'pdf' || outputOptions.sendEmail
        ? await openItemsService.generateStatementOutput(
          req.params.entityId,
          query.entityType,
          dateRange,
          outputOptions,
          req.user._id,
          meta,
        )
        : await openItemsService.generateStatement(req.params.entityId, query.entityType, dateRange);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getNetPosition(req, res, next) {
    try {
      const data = await openItemsService.getNetPosition(req.params.entityId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async netItems(req, res, next) {
    try {
      const data = await openItemsService.netItems(req.body, req.user._id);
      return res.success({ data, message: 'Open items netted successfully' });
    } catch (err) { next(err); }
  }
}

const openItemsController = new OpenItemsController();
export default openItemsController;
