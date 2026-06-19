import chatService from './chat.service.js';

class ChatController {
  async listMessages(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await chatService.listMessages(req.params.id, req.user, {
        limit: query.limit ? Number(query.limit) : undefined,
        before: query.before || undefined,
      });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async listMembers(req, res, next) {
    try {
      const data = await chatService.listMembers(req.params.id, req.user);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async sendMessage(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = {
        ...req.body,
        senderName: `${req.user.firstName} ${req.user.lastName}`,
      };
      const message = await chatService.sendMessage(req.params.id, data, req.user, meta);
      return res.success({ data: message, message: 'Message sent successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async markAsRead(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await chatService.markAsRead(req.params.messageId, req.user, meta);
      return res.success({ message: 'Message marked as read' });
    } catch (err) { next(err); }
  }
}

const chatController = new ChatController();
export default chatController;
