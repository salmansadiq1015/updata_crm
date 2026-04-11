import smallOrderService from './smallOrder.service.js';

class SmallOrderController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const projectId = req.params.id;
      const data = await smallOrderService.create(projectId, req.body, req.user._id, meta);
      return res.success({ data, message: 'Small order created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await smallOrderService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data, message: 'Small order updated successfully' });
    } catch (err) { next(err); }
  }

  async cancel(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await smallOrderService.cancel(req.params.id, req.user._id, meta);
      return res.success({ message: 'Small order cancelled successfully' });
    } catch (err) { next(err); }
  }
}

const smallOrderController = new SmallOrderController();
export default smallOrderController;
