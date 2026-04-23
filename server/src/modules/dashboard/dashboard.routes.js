import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../../shared/middleware/authenticate.js';
import cacheManager from '../../shared/cache/CacheManager.js';

const router = Router();

router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const data = await cacheManager.getOrSet(
      'app:dashboard:stats',
      async () => {
        const Customer = mongoose.model('Customer');
        const Project = mongoose.model('Project');
        const Quotation = mongoose.model('Quotation');
        const Task = mongoose.model('Task');

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const [customers, projects, openQuotes, todayTasks] = await Promise.all([
          Customer.countDocuments(),
          Project.countDocuments(),
          Quotation.countDocuments({ status: { $in: ['DRAFT', 'SENT', 'VIEWED'] } }),
          Task.countDocuments({
            isDeleted: false,
            status: { $in: ['OPEN', 'IN_PROGRESS'] },
            dueDate: { $gte: todayStart, $lte: todayEnd },
          }),
        ]);

        return { customers, projects, openQuotes, todayTasks };
      },
      { l1Ttl: 30, l2Ttl: 60 },
    );

    return res.success({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
