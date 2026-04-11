import syncService from './sync.service.js';

class SyncController {
  async fullSync(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await syncService.fullSync(req.user._id, req.body, meta);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getSyncStatus(req, res, next) {
    try {
      const data = await syncService.getSyncStatus(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const syncController = new SyncController();
export default syncController;
