import statusService from './status.service.js';

class StatusController {
  async transitionStatus(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { targetStatus, comment, override, overrideReason } = req.body;
      const result = await statusService.transitionStatus(
        req.params.id,
        targetStatus,
        { comment, override, overrideReason },
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Project status updated successfully' });
    } catch (err) { next(err); }
  }

  async getStatusHistory(req, res, next) {
    try {
      const history = await statusService.getStatusHistory(req.params.id);
      return res.success({ data: history });
    } catch (err) { next(err); }
  }
}

const statusController = new StatusController();
export default statusController;
