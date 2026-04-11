import installationService from './installation.service.js';

class InstallationController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const installation = await installationService.create(req.params.siteId, req.body, req.user._id, meta);
      return res.success({ data: installation, message: 'Installation created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listBySite(req, res, next) {
    try {
      const data = await installationService.listBySite(req.params.siteId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const installation = await installationService.getById(req.params.id);
      return res.success({ data: installation });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const installation = await installationService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: installation, message: 'Installation updated successfully' });
    } catch (err) { next(err); }
  }

  async decommission(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const installation = await installationService.decommission(req.params.id, req.body.reason, req.user._id, meta);
      return res.success({ data: installation, message: 'Installation decommissioned successfully' });
    } catch (err) { next(err); }
  }
}

const installationController = new InstallationController();
export default installationController;
