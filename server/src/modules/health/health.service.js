import mongoose from 'mongoose';
import { isRedisConnected } from '../../config/redis.js';
import storageService from '../../shared/storage/StorageService.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

/**
 * Health check service.
 *
 * Liveness: is the process alive? (always true if this code executes)
 * Readiness: are all dependencies healthy? (DB, Redis, S3)
 *
 * Readiness results are cached in L1 (NodeCache) for 10s to avoid
 * hammering dependencies when 10 LB instances probe every 30s.
 */
const CACHE_KEY = 'core:health:ready';
const CACHE_TTL = 10; // seconds

class HealthService {
  constructor() {
    this.startTime = Date.now();
    this.version = process.env.npm_package_version || '1.0.0';
  }

  /**
   * Liveness — is the process running?
   */
  getLiveness() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: this.version,
    };
  }

  /**
   * Readiness — are all dependencies healthy?
   * Returns cached result if fresh enough.
   */
  async getReadiness() {
    // Check L1 cache first (avoid hammering deps)
    const cached = await cacheManager.get(CACHE_KEY, { skipL2: true });
    if (cached) return cached;

    const checks = {};
    let overallStatus = 'ok';

    // Database
    checks.database = await this._checkDatabase();
    if (checks.database.status !== 'ok') overallStatus = 'degraded';

    // Redis
    checks.redis = await this._checkRedis();
    if (checks.redis.status !== 'ok') overallStatus = 'degraded';

    // S3
    checks.fileStorage = await this._checkStorage();
    if (checks.fileStorage.status !== 'ok') overallStatus = 'degraded';

    // If any critical dependency (DB) is down → unhealthy
    if (checks.database.status !== 'ok') overallStatus = 'unhealthy';

    const result = {
      status: overallStatus,
      checks,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: this.version,
    };

    // Cache in L1 only (per-instance, short TTL)
    await cacheManager.set(CACHE_KEY, result, { l1Ttl: CACHE_TTL, skipL2: true });

    return result;
  }

  async _checkDatabase() {
    const start = Date.now();
    try {
      if (mongoose.connection.readyState !== 1) {
        return { status: 'unhealthy', latency: Date.now() - start, error: 'Not connected' };
      }
      await mongoose.connection.db.admin().ping();
      return { status: 'ok', latency: Date.now() - start };
    } catch (err) {
      logger.warn('Health check: database unhealthy', {
        module: 'health',
        error: { message: err.message },
      });
      return { status: 'unhealthy', latency: Date.now() - start, error: err.message };
    }
  }

  async _checkRedis() {
    const start = Date.now();
    try {
      if (!isRedisConnected()) {
        return { status: 'unhealthy', latency: Date.now() - start, error: 'Not connected' };
      }
      return { status: 'ok', latency: Date.now() - start };
    } catch (err) {
      return { status: 'unhealthy', latency: Date.now() - start, error: err.message };
    }
  }

  async _checkStorage() {
    const start = Date.now();
    try {
      const healthy = await storageService.healthCheck();
      return {
        status: healthy ? 'ok' : 'unhealthy',
        latency: Date.now() - start,
      };
    } catch (err) {
      return { status: 'unhealthy', latency: Date.now() - start, error: err.message };
    }
  }
}

const healthService = new HealthService();
export default healthService;
