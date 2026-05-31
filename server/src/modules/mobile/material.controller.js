import materialService from './material.service.js';

class MaterialController {
  async listByOrder(req, res, next) {
    try {
      const data = await materialService.listByOrder(req.params.id, req.user);
      return res.success({ data });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await materialService.create(
        req.params.id,
        req.body,
        req.user,
        meta,
      );
      return res.success({
        data,
        message: 'Material line created successfully',
        statusCode: 201,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await materialService.update(
        req.params.id,
        req.params.materialId,
        req.body,
        req.user,
        meta,
      );
      return res.success({
        data,
        message: 'Material line updated successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await materialService.remove(
        req.params.id,
        req.params.materialId,
        req.user,
        meta,
      );
      return res.success({ message: 'Material line deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
}

const materialController = new MaterialController();
export default materialController;
