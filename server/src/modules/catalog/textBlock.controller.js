import textBlockService from './textBlock.service.js';

class TextBlockController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await textBlockService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const textBlock = await textBlockService.getById(req.params.id);
      return res.success({ data: textBlock });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const textBlock = await textBlockService.create(req.body, req.user._id, meta);
      return res.success({ data: textBlock, message: 'Text block created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const textBlock = await textBlockService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: textBlock, message: 'Text block updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await textBlockService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Text block deleted successfully' });
    } catch (err) { next(err); }
  }
}

const textBlockController = new TextBlockController();
export default textBlockController;
