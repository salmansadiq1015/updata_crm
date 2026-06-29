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
      const result = await reportService.list({
        status: filters.status,
        orderId: filters.orderId,
        projectId: filters.projectId,
        customerId: filters.customerId,
        technicianId: filters.technicianId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
        includeArchived: filters.includeArchived === 'true' || filters.includeArchived === true,
        page: filters.page,
        pageSize: filters.pageSize,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      });
      return res.success({ data: result.items, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async summary(req, res, next) {
    try {
      const filters = req._validatedQuery || req.query;
      const summary = await reportService.getSummary({
        status: filters.status,
        orderId: filters.orderId,
        projectId: filters.projectId,
        customerId: filters.customerId,
        technicianId: filters.technicianId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
        includeArchived: filters.includeArchived === 'true' || filters.includeArchived === true,
      });
      return res.success({ data: summary });
    } catch (err) { next(err); }
  }

  async exportCsv(req, res, next) {
    try {
      const filters = req._validatedQuery || req.query;
      const { filename, csv } = await reportService.exportCsv({
        ...filters,
        includeArchived: filters.includeArchived === 'true' || filters.includeArchived === true,
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (err) { next(err); }
  }

  async importTemplate(req, res, next) {
    try {
      const csv = reportService.importTemplate();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="work-report-import-template.csv"');
      return res.status(200).send(csv);
    } catch (err) { next(err); }
  }

  async importCsv(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const body = req.body || {};
      const result = await reportService.importCsv(req.file, { dryRun: body.dryRun }, req.user._id, meta);
      return res.success({
        data: result,
        message: result.dryRun ? 'Report import validated' : 'Report import completed',
        statusCode: result.dryRun ? 200 : 201,
      });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.create(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: report, message: 'Work report created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async generate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.generateFromSources(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: report, message: 'Work report generated successfully', statusCode: 201 });
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

  async approve(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.approve(req.params.reportId, req.user._id, meta);
      return res.success({ data: report, message: 'Work report approved successfully' });
    } catch (err) { next(err); }
  }

  async reject(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.reject(req.params.reportId, req.body, req.user._id, meta);
      return res.success({ data: report, message: 'Work report rejected successfully' });
    } catch (err) { next(err); }
  }

  async markInvoiced(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.markInvoiced(req.params.reportId, req.body, req.user._id, meta);
      return res.success({ data: report, message: 'Work report marked as invoiced' });
    } catch (err) { next(err); }
  }

  async createInvoice(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const report = await reportService.createInvoiceFromReport(req.params.reportId, req.body, req.user._id, meta);
      return res.success({ data: report, message: 'Invoice created from work report' });
    } catch (err) { next(err); }
  }

  async history(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const entries = await reportService.getHistory(req.params.reportId, query.limit);
      return res.success({ data: entries });
    } catch (err) { next(err); }
  }
}

const reportController = new ReportController();
export default reportController;
