import ighService from './igh.service.js';

class IghController {
  async getConfig(req, res, next) {
    try {
      const data = await ighService.getConfig();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async updateConfig(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await ighService.updateConfig(req.body, req.user._id, meta);
      return res.success({ data, message: 'IGH configuration updated successfully' });
    } catch (err) { next(err); }
  }

  async triggerFullImport(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const job = await ighService.triggerFullImport(req.user._id, meta);
      return res.success({ data: job, message: 'Full IGH import triggered', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async triggerDeltaImport(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const job = await ighService.triggerDeltaImport(req.user._id, meta);
      return res.success({ data: job, message: 'Delta IGH import triggered', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getImportJob(req, res, next) {
    try {
      const data = await ighService.getImportJob(req.params.jobId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getImportLog(req, res, next) {
    try {
      const data = await ighService.getImportLog(req.params.jobId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getImportHistory(req, res, next) {
    try {
      const data = await ighService.getImportHistory(req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const ighController = new IghController();
export default ighController;
