import widgetSubmissionService from './widgetSubmission.service.js';

class WidgetAdminController {
  async listSubmissions(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await widgetSubmissionService.listSubmissions(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getSubmission(req, res, next) {
    try {
      const data = await widgetSubmissionService.getSubmission(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async markProcessed(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await widgetSubmissionService.markProcessed(req.params.id, req.body, req.user._id, meta);
      return res.success({ data, message: 'Submission marked as processed' });
    } catch (err) { next(err); }
  }

  async updateConfig(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await widgetSubmissionService.updateConfig(req.body, req.user._id, meta);
      return res.success({ data, message: 'Widget config updated successfully' });
    } catch (err) { next(err); }
  }

  async getConfig(req, res, next) {
    try {
      const data = await widgetSubmissionService.getConfig();
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const widgetAdminController = new WidgetAdminController();
export default widgetAdminController;
