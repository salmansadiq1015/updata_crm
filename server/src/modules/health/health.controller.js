import healthService from './health.service.js';

/**
 * Health check controller.
 * No business logic — delegates to service, formats response.
 */
class HealthController {
  async live(req, res) {
    const result = healthService.getLiveness();
    return res.status(200).json(result);
  }

  async ready(req, res, next) {
    try {
      const result = await healthService.getReadiness();
      const statusCode = result.status === 'unhealthy' ? 503 : 200;
      return res.status(statusCode).json(result);
    } catch (err) {
      next(err);
    }
  }
}

const healthController = new HealthController();
export default healthController;
