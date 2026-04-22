import maintenanceIntervalService from './maintenanceInterval.service.js';

class MaintenanceController {
  async createForInstallation(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const interval = await maintenanceIntervalService.create(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: interval, message: 'Maintenance interval created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listByInstallation(req, res, next) {
    try {
      const data = await maintenanceIntervalService.listByInstallation(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const interval = await maintenanceIntervalService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: interval, message: 'Maintenance interval updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await maintenanceIntervalService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Maintenance interval deleted successfully' });
    } catch (err) { next(err); }
  }

  async dashboard(req, res, next) {
    try {
      const data = await maintenanceIntervalService.getDashboard();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async listDue(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await maintenanceIntervalService.listDue(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async listOverdue(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await maintenanceIntervalService.listOverdue(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async exportCsv(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { format, ...filters } = query;
      const csv = await maintenanceIntervalService.exportCsv(filters);
      const filename = `maintenance-${filters.status || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    } catch (err) { next(err); }
  }
}

const maintenanceController = new MaintenanceController();
export default maintenanceController;
