import importService from './import.service.js';

/**
 * Import controller (§11). Mounted under /business-discovery. Identity is always
 * derived from req.user._id. Discovery results/jobs are scoped to the importing
 * user by the service.
 */
class ImportController {
  async preview(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const counts = await importService.preview(
        req.params.id,
        { mode: query.mode },
        req.user._id,
      );
      return res.success({ data: counts });
    } catch (err) { next(err); }
  }

  async importSession(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await importService.importFromSession(
        req.params.id,
        { mode: req.body.mode, selection: req.body.selection },
        req.user._id,
        meta,
      );

      // Large run → a tracked job was enqueued (202 Accepted).
      if (result.jobId) {
        return res.success({ data: { jobId: result.jobId }, message: 'Lead import queued', statusCode: 202 });
      }
      return res.success({ data: result.summary, message: 'Lead import completed' });
    } catch (err) { next(err); }
  }

  async importResult(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await importService.importResult(
        req.params.resultId,
        { mode: req.body.mode },
        req.user._id,
        meta,
      );
      return res.success({ data: result.summary, message: 'Lead import completed' });
    } catch (err) { next(err); }
  }

  async getImportJob(req, res, next) {
    try {
      const data = await importService.getImportJob(req.params.jobId, req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const importController = new ImportController();
export default importController;
