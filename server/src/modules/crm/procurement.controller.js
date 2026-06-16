import procurementService from './procurement.service.js';

function metaFrom(req) {
  return { ipAddress: req.ip, userAgent: req.get('user-agent') };
}

class ProcurementController {
  async getStats(req, res, next) {
    try {
      const data = await procurementService.getStats();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async listLowStock(req, res, next) {
    try {
      const result = await procurementService.listLowStock(req._validatedQuery || req.query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async listInventoryMovements(req, res, next) {
    try {
      const result = await procurementService.listInventoryMovements({
        ...(req._validatedQuery || req.query),
        ...(req.params.id ? { sparePartId: req.params.id } : {}),
      });
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async adjustStock(req, res, next) {
    try {
      const data = await procurementService.adjustStock(req.params.id, req.body, req.user._id, metaFrom(req));
      return res.success({ data, message: 'Stock adjusted successfully' });
    } catch (err) { next(err); }
  }

  async listSuppliers(req, res, next) {
    try {
      const result = await procurementService.listSuppliers(req._validatedQuery || req.query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async searchSuppliers(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await procurementService.searchSuppliers(query.q, query.limit);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getSupplierById(req, res, next) {
    try {
      const data = await procurementService.getSupplierById(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async createSupplier(req, res, next) {
    try {
      const data = await procurementService.createSupplier(req.body, req.user._id, metaFrom(req));
      return res.success({ data, message: 'Supplier created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async updateSupplier(req, res, next) {
    try {
      const data = await procurementService.updateSupplier(req.params.id, req.body, req.user._id, metaFrom(req));
      return res.success({ data, message: 'Supplier updated successfully' });
    } catch (err) { next(err); }
  }

  async deleteSupplier(req, res, next) {
    try {
      await procurementService.deleteSupplier(req.params.id, req.user._id, metaFrom(req));
      return res.success({ message: 'Supplier deleted successfully' });
    } catch (err) { next(err); }
  }

  async listPurchaseOrders(req, res, next) {
    try {
      const result = await procurementService.listPurchaseOrders(req._validatedQuery || req.query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getPurchaseOrderById(req, res, next) {
    try {
      const data = await procurementService.getPurchaseOrderById(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async createPurchaseOrder(req, res, next) {
    try {
      const data = await procurementService.createPurchaseOrder(req.body, req.user._id, metaFrom(req));
      return res.success({ data, message: 'Purchase order created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async updatePurchaseOrder(req, res, next) {
    try {
      const data = await procurementService.updatePurchaseOrder(req.params.id, req.body, req.user._id, metaFrom(req));
      return res.success({ data, message: 'Purchase order updated successfully' });
    } catch (err) { next(err); }
  }

  async cancelPurchaseOrder(req, res, next) {
    try {
      const data = await procurementService.cancelPurchaseOrder(req.params.id, req.user._id, metaFrom(req));
      return res.success({ data, message: 'Purchase order cancelled successfully' });
    } catch (err) { next(err); }
  }

  async receivePurchaseOrder(req, res, next) {
    try {
      const data = await procurementService.receivePurchaseOrder(req.params.id, req.body, req.user._id, metaFrom(req));
      return res.success({ data, message: 'Goods receipt recorded successfully' });
    } catch (err) { next(err); }
  }

  async uploadDeliveryNote(req, res, next) {
    try {
      const data = await procurementService.uploadDeliveryNote(req.file, req.body, req.user._id, metaFrom(req));
      return res.success({ data, message: 'Delivery note extracted successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getDeliveryNoteOcrResult(req, res, next) {
    try {
      const data = await procurementService.getDeliveryNoteOcrResult(req.params.jobId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async confirmDeliveryNoteOcr(req, res, next) {
    try {
      const data = await procurementService.confirmDeliveryNoteOcr(req.params.jobId, req.body, req.user._id, metaFrom(req));
      return res.success({ data, message: 'Delivery note confirmed successfully' });
    } catch (err) { next(err); }
  }
}

const procurementController = new ProcurementController();
export default procurementController;
