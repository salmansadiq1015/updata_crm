class InstallationController {
  async listBySite(req, res, next) {
    try {
      const { default: installationRepository } = await import('../crm/installation.repository.js');
      const data = await installationRepository.findBySiteId(req.params.siteId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const { default: installationRepository } = await import('../crm/installation.repository.js');
      const data = await installationRepository.findById(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getHistory(req, res, next) {
    try {
      // Placeholder: cross-module aggregation deferred
      return res.success({ data: [] });
    } catch (err) { next(err); }
  }
}

const installationController = new InstallationController();
export default installationController;
