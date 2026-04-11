import reportService from './report.service.js';

class ReportController {
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
