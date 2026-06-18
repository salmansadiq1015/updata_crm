import notificationDeliveryRepository from './notificationDelivery.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';

const METRICS_TTL = { l1Ttl: 60, l2Ttl: 180 };

const PERIOD_MAP = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

class NotificationMetricsService {
  async getMetrics({ period = '24h', channel } = {}) {
    const cacheKey = `notif:metrics:${period}:${channel || 'all'}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const { from, to } = this._getDateRange(period);

        if (channel) {
          const channelStats = await notificationDeliveryRepository.getChannelStats(channel, from.toISOString());

          // Get latency from the aggregate metrics
          const rawMetrics = await notificationDeliveryRepository.getMetrics(from, to);
          const channelMetrics = rawMetrics.filter((m) => m.channel === channel);

          let totalLatency = 0;
          let latencyCount = 0;
          for (const m of channelMetrics) {
            if (m.avgLatencyMs !== null && m.avgLatencyMs !== undefined) {
              totalLatency += m.avgLatencyMs * m.count;
              latencyCount += m.count;
            }
          }

          return {
            period,
            channel,
            from,
            to,
            stats: {
              ...channelStats,
              avgLatencyMs: latencyCount > 0 ? Math.round((totalLatency / latencyCount) * 100) / 100 : null,
            },
          };
        }

        // All channels
        const rawMetrics = await notificationDeliveryRepository.getMetrics(from, to);

        const channelMap = {};
        for (const m of rawMetrics) {
          if (!channelMap[m.channel]) {
            channelMap[m.channel] = {
              sent: 0,
              delivered: 0,
              failed: 0,
              bounced: 0,
              read: 0,
              avgLatencyMs: null,
              _totalLatency: 0,
              _latencyCount: 0,
            };
          }

          const ch = channelMap[m.channel];
          const statusKey = m.status?.toLowerCase();

          if (statusKey === 'sent') ch.sent += m.count;
          else if (statusKey === 'delivered') ch.delivered += m.count;
          else if (statusKey === 'failed') ch.failed += m.count;
          else if (statusKey === 'bounced') ch.bounced += m.count;
          else if (statusKey === 'read') ch.read += m.count;

          if (m.avgLatencyMs !== null && m.avgLatencyMs !== undefined) {
            ch._totalLatency += m.avgLatencyMs * m.count;
            ch._latencyCount += m.count;
          }
        }

        // Compute final avgLatencyMs and clean up internal fields
        const channels = {};
        for (const [ch, stats] of Object.entries(channelMap)) {
          const { _totalLatency, _latencyCount, ...rest } = stats;
          channels[ch] = {
            ...rest,
            avgLatencyMs: _latencyCount > 0
              ? Math.round((_totalLatency / _latencyCount) * 100) / 100
              : null,
          };
        }

        // Compute totals
        let totalSent = 0;
        let totalDelivered = 0;
        let totalFailed = 0;
        let totalBounced = 0;

        for (const stats of Object.values(channels)) {
          totalSent += stats.sent;
          totalDelivered += stats.delivered;
          totalFailed += stats.failed;
          totalBounced += stats.bounced;
        }

        return {
          period,
          from,
          to,
          totals: {
            sent: totalSent,
            delivered: totalDelivered,
            failed: totalFailed,
            bounced: totalBounced,
          },
          channels,
        };
      },
      METRICS_TTL,
    );
  }

  _getDateRange(period) {
    const now = new Date();
    const durationMs = PERIOD_MAP[period] || PERIOD_MAP['24h'];

    return {
      from: new Date(now.getTime() - durationMs),
      to: now,
    };
  }
}

const notificationMetricsService = new NotificationMetricsService();
export default notificationMetricsService;
