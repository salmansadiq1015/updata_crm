import priceService from './price.service.js';

class PriceController {
  async updatePrice(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { type } = req.body;
      let result;

      if (type === 'individual') {
        const { articleId, newPrice } = req.body;
        result = await priceService.updatePrice(articleId, newPrice, req.user._id, meta);
      } else if (type === 'bulk') {
        const { updates, description } = req.body;
        result = await priceService.bulkUpdate(updates, description, req.user._id, meta);
      } else if (type === 'percentage') {
        const { filter, percentage, description } = req.body;
        result = await priceService.percentageUpdate(filter, percentage, description, req.user._id, meta);
      }

      return res.success({ data: result, message: 'Price update applied successfully' });
    } catch (err) { next(err); }
  }

  async getHistory(req, res, next) {
    try {
      const data = await priceService.getHistory(req.params.articleId, req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async scheduleUpdate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const batch = await priceService.scheduleUpdate(req.body, req.user._id, meta);
      return res.success({ data: batch, message: 'Price update scheduled successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async rollback(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const batch = await priceService.rollback(req.params.batchId, req.user._id, meta);
      return res.success({ data: batch, message: 'Price batch rolled back successfully' });
    } catch (err) { next(err); }
  }
}

const priceController = new PriceController();
export default priceController;
