import taskFolderService from './taskFolder.service.js';

const getMeta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });

class TaskFolderController {
  async list(req, res, next) {
    try {
      const data = await taskFolderService.getAllForUser(req.user._id.toString());
      res.success({ data });
    } catch (error) { next(error); }
  }

  async create(req, res, next) {
    try {
      const meta = getMeta(req);
      const folder = await taskFolderService.create(req.body, req.user._id.toString(), meta);
      res.success({ data: folder, statusCode: 201 });
    } catch (error) { next(error); }
  }

  async getById(req, res, next) {
    try {
      const folder = await taskFolderService.getById(req.params.id, req.user._id.toString());
      res.success({ data: folder });
    } catch (error) { next(error); }
  }

  async update(req, res, next) {
    try {
      const meta = getMeta(req);
      const folder = await taskFolderService.update(req.params.id, req.body, req.user._id.toString(), meta);
      res.success({ data: folder });
    } catch (error) { next(error); }
  }

  async remove(req, res, next) {
    try {
      const meta = getMeta(req);
      const result = await taskFolderService.remove(req.params.id, req.user._id.toString(), meta);
      res.success({ data: result });
    } catch (error) { next(error); }
  }

  async reorder(req, res, next) {
    try {
      const result = await taskFolderService.reorder(req.body.orderedIds, req.user._id.toString());
      res.success({ data: result });
    } catch (error) { next(error); }
  }
}

const taskFolderController = new TaskFolderController();
export default taskFolderController;
