import reportService from './report.service.js';

class ReportController {
  async listByOrder(req, res, next) {
    try {
      const reports = await reportService.listByOrder(req.params.id);
      return res.success({ data: reports });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const filters = req._validatedQuery || req.query;
      const reports = await reportService.list({
        status: filters.status,
        orderId: filters.orderId,
        technicianId: filters.technicianId,
        includeArchived: filters.includeArchived === 'true' || filters.includeArchived === true,
      });
      return res.success({ data: reports });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.create(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: report, message: 'Work report created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.update(req.params.reportId, req.body, req.user._id, meta);
      return res.success({ data: report, message: 'Work report updated successfully' });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const report = await reportService.getById(req.params.reportId);
      return res.success({ data: report });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await reportService.delete(req.params.reportId, req.user._id, meta);
      return res.success({ message: 'Work report deleted successfully' });
    } catch (err) { next(err); }
  }

  async bulkDelete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { ids } = req.body;
      await reportService.bulkDelete(ids, req.user._id, meta);
      return res.success({ message: `${ids.length} reports deleted successfully` });
    } catch (err) { next(err); }
  }

  async archive(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.archive(req.params.reportId, req.user._id, meta);
      return res.success({ data: report, message: 'Report archived successfully' });
    } catch (err) { next(err); }
  }

  async unarchive(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.unarchive(req.params.reportId, req.user._id, meta);
      return res.success({ data: report, message: 'Report unarchived successfully' });
    } catch (err) { next(err); }
  }

  async bulkArchive(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { ids } = req.body;
      await reportService.bulkArchive(ids, req.user._id, meta);
      return res.success({ message: `${ids.length} reports archived successfully` });
    } catch (err) { next(err); }
  }

  async submit(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.submit(req.params.reportId, req.user._id, meta);
      return res.success({ data: report, message: 'Work report submitted successfully' });
    } catch (err) { next(err); }
  }
}

const reportController = new ReportController();
export default reportController;
