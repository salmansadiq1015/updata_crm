import unitOfMeasureService from './unitOfMeasure.service.js';

class UnitOfMeasureController {
  async list(req, res, next) {
    try {
      const data = await unitOfMeasureService.list();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const unit = await unitOfMeasureService.create(req.body, req.user._id, meta);
      return res.success({ data: unit, message: 'Unit of measure created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const unit = await unitOfMeasureService.update(req.params.code, req.body, req.user._id, meta);
      return res.success({ data: unit, message: 'Unit of measure updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await unitOfMeasureService.delete(req.params.code, req.user._id, meta);
      return res.success({ message: 'Unit of measure deleted successfully' });
    } catch (err) { next(err); }
  }
}

const unitOfMeasureController = new UnitOfMeasureController();
export default unitOfMeasureController;
