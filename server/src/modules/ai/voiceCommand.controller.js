import voiceCommandService from './voiceCommand.service.js';

class VoiceCommandController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const command = await voiceCommandService.create(req.body, req.user._id, meta);
      return res.success({ data: command, message: 'Voice command created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const command = await voiceCommandService.getById(req.params.id);
      return res.success({ data: command });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await voiceCommandService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const command = await voiceCommandService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: command, message: 'Voice command updated successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await voiceCommandService.remove(req.params.id, req.user._id, meta);
      return res.success({ message: 'Voice command deleted successfully' });
    } catch (err) { next(err); }
  }
}

const voiceCommandController = new VoiceCommandController();
export default voiceCommandController;
