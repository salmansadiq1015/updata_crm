import assetMaintenanceService from './assetMaintenance.service.js';

class AssetMaintenanceController {
  async listWorkItems(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await assetMaintenanceService.listWorkItems(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }

  async getContext(req, res, next) {
    try {
      const data = await assetMaintenanceService.getContext(req.params.installationId);
      return res.success({ data });
    } catch (err) {
      next(err);
    }
  }

  async bulkCreateMaintenance(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await assetMaintenanceService.bulkCreateMaintenance(req.body, req.user._id, meta);
      return res.success({ data, message: 'Maintenance entries processed successfully', statusCode: 201 });
    } catch (err) {
      next(err);
    }
  }

  async schedule(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await assetMaintenanceService.schedule(req.body, req.user._id, meta);
      return res.success({ data, message: 'Maintenance assignment scheduled successfully', statusCode: 201 });
    } catch (err) {
      next(err);
    }
  }
}

const assetMaintenanceController = new AssetMaintenanceController();
export default assetMaintenanceController;
