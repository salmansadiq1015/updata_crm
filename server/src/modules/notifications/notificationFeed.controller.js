import notificationFeedService from './notificationFeed.service.js';

class NotificationFeedController {
  async getFeed(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await notificationFeedService.getFeed(req.user._id, query);
      return res.success({
        data: {
          items: result.data,
          summary: result.summary,
          unreadCount: result.summary?.unread || 0,
        },
        pagination: result.pagination,
      });
    } catch (err) { next(err); }
  }

  async getUnreadCount(req, res, next) {
    try {
      const count = await notificationFeedService.getUnreadCount(req.user._id);
      return res.success({ data: { unreadCount: count } });
    } catch (err) { next(err); }
  }

  async markRead(req, res, next) {
    try {
      const result = await notificationFeedService.markRead(req.params.id, req.user._id);
      return res.success({ data: result, message: 'Notification marked as read' });
    } catch (err) { next(err); }
  }

  async markAllRead(req, res, next) {
    try {
      const result = await notificationFeedService.markAllRead(req.user._id);
      return res.success({ data: result, message: 'All notifications marked as read' });
    } catch (err) { next(err); }
  }

  async dismiss(req, res, next) {
    try {
      const result = await notificationFeedService.dismiss(req.params.id, req.user._id);
      return res.success({ data: result, message: 'Notification dismissed successfully' });
    } catch (err) { next(err); }
  }
}

const notificationFeedController = new NotificationFeedController();
export default notificationFeedController;
