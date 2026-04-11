import systemService from './system.service.js';

class SystemController {
  async getConfig(req, res, next) {
    try {
      const cfg = systemService.getConfig();
      return res.success({ data: cfg });
    } catch (err) {
      next(err);
    }
  }

  async getJobs(req, res, next) {
    try {
      const stats = await systemService.getJobQueues();
      return res.success({ data: stats });
    } catch (err) {
      next(err);
    }
  }

  async getJob(req, res, next) {
    try {
      const { queueName, jobId } = req.params;
      const job = await systemService.getJob(queueName, jobId);
      if (!job) {
        return res.fail({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      }
      return res.success({ data: job });
    } catch (err) {
      next(err);
    }
  }

  async removeJob(req, res, next) {
    try {
      const { queueName, jobId } = req.params;
      const result = await systemService.removeJob(queueName, jobId);
      if (!result) {
        return res.fail({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      }
      return res.success({ data: result, message: 'Job removed' });
    } catch (err) {
      next(err);
    }
  }

  async getFailedJobs(req, res, next) {
    try {
      const { queue } = req.query;
      const jobs = await systemService.getFailedJobs(queue);
      return res.success({ data: jobs });
    } catch (err) {
      next(err);
    }
  }

  async retryFailedJob(req, res, next) {
    try {
      const { queueName, jobId } = req.params;
      const result = await systemService.retryJob(queueName, jobId);
      return res.success({ data: result, message: 'Job retried' });
    } catch (err) {
      next(err);
    }
  }

  async invalidateCache(req, res, next) {
    try {
      const { pattern } = req.body;
      if (!pattern) {
        return res.fail({ statusCode: 400, code: 'PATTERN_REQUIRED', message: 'Cache pattern is required' });
      }
      const result = await systemService.invalidateCache(pattern);
      return res.success({ data: result, message: 'Cache invalidated' });
    } catch (err) {
      next(err);
    }
  }

  async getCacheStats(req, res, next) {
    try {
      const stats = systemService.getCacheStats();
      return res.success({ data: stats });
    } catch (err) {
      next(err);
    }
  }
}

const systemController = new SystemController();
export default systemController;
