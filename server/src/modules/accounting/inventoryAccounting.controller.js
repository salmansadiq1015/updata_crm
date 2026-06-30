import inventoryAccountingService from './inventoryAccounting.service.js';

function meta(req) {
  return { ipAddress: req.ip, userAgent: req.get('user-agent') };
}

class InventoryAccountingController {
  async valuation(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const valuation = await inventoryAccountingService.valuation(query);
      return res.success({ data: valuation });
    } catch (err) { next(err); }
  }

  async movements(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const movements = await inventoryAccountingService.movements(query);
      return res.success({ data: movements });
    } catch (err) { next(err); }
  }

  async entries(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const entries = await inventoryAccountingService.entries(query);
      return res.success({ data: entries });
    } catch (err) { next(err); }
  }

  async postMovement(req, res, next) {
    try {
      const entry = await inventoryAccountingService.postMovement(req.params.movementId, req.body, req.user._id, meta(req));
      return res.success({ data: entry, message: 'Inventory movement posted', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async postPeriod(req, res, next) {
    try {
      const result = await inventoryAccountingService.postPeriod(req.body, req.user._id, meta(req));
      return res.success({ data: result, message: 'Inventory period posting completed' });
    } catch (err) { next(err); }
  }
}

const inventoryAccountingController = new InventoryAccountingController();
export default inventoryAccountingController;
