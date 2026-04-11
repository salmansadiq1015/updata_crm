import prepActionService from './prepAction.service.js';

class PrepActionController {
  async list(req, res, next) {
    try {
      const actions = await prepActionService.listByProject(req.params.id);
      return res.success({ data: actions });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const action = await prepActionService.create(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: action, message: 'Preparatory action created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const action = await prepActionService.getById(req.params.actionId);
      return res.success({ data: action });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const action = await prepActionService.update(req.params.actionId, req.body, req.user._id, meta);
      return res.success({ data: action, message: 'Preparatory action updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await prepActionService.delete(req.params.actionId, req.user._id, meta);
      return res.success({ message: 'Preparatory action deleted successfully' });
    } catch (err) { next(err); }
  }
}

const prepActionController = new PrepActionController();
export default prepActionController;
