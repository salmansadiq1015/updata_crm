import integrationConfigService from './integrationConfig.service.js';
import integrationHealthService from './integrationHealth.service.js';
import integrationSyncLogService from './integrationSyncLog.service.js';

class IntegrationAdminController {
  async listAll(req, res, next) {
    try {
      const data = await integrationConfigService.listAll();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getByKey(req, res, next) {
    try {
      const data = await integrationConfigService.getByKey(req.params.key);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async updateConfig(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await integrationConfigService.updateConfig(req.params.key, req.body, req.user._id, meta);
      return res.success({ data, message: 'Integration config updated successfully' });
    } catch (err) { next(err); }
  }

  async enable(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await integrationConfigService.enable(req.params.key, req.user._id, meta);
      return res.success({ data, message: 'Integration enabled successfully' });
    } catch (err) { next(err); }
  }

  async disable(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await integrationConfigService.disable(req.params.key, req.user._id, meta);
      return res.success({ data, message: 'Integration disabled successfully' });
    } catch (err) { next(err); }
  }

  async runHealthCheck(req, res, next) {
    try {
      const data = await integrationHealthService.runHealthCheck(req.params.key);
      return res.success({ data, message: 'Health check completed' });
    } catch (err) { next(err); }
  }

  async getHealthHistory(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await integrationHealthService.getHealthHistory(req.params.key, query.period);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getDashboard(req, res, next) {
    try {
      const data = await integrationHealthService.getDashboard();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getMetrics(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await integrationHealthService.getMetrics(req.params.key, query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getSyncHistory(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await integrationSyncLogService.getSyncHistory(req.params.key, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getSyncById(req, res, next) {
    try {
      const data = await integrationSyncLogService.getSyncById(req.params.key, req.params.syncId);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const integrationAdminController = new IntegrationAdminController();
export default integrationAdminController;
