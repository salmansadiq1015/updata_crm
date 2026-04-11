import documentNumberSequenceService from './documentNumberSequence.service.js';

class DocumentNumberSequenceController {
  async list(req, res, next) {
    try {
      const data = await documentNumberSequenceService.list();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const sequence = await documentNumberSequenceService.create(req.body, req.user._id, meta);
      return res.success({ data: sequence, message: 'Sequence created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const sequence = await documentNumberSequenceService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: sequence, message: 'Sequence updated successfully' });
    } catch (err) { next(err); }
  }

  async preview(req, res, next) {
    try {
      const preview = await documentNumberSequenceService.preview(req.params.id);
      return res.success({ data: { preview } });
    } catch (err) { next(err); }
  }
}

const documentNumberSequenceController = new DocumentNumberSequenceController();
export default documentNumberSequenceController;
