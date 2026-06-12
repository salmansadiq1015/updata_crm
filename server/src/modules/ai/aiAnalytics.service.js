import accuracyMetricRepository from './accuracyMetric.repository.js';
import { METRIC_FEATURES } from './accuracyMetric.model.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

const ACCURACY_TTL = { l1Ttl: 60, l2Ttl: 300 };

class AiAnalyticsService {
  /**
   * Get accuracy metrics for a given period, feature, and language.
   *
   * @param {object} params
   * @param {string} params.period - e.g. '2026-03'
   * @param {string} [params.feature] - e.g. 'STT', 'INTENT'
   * @param {string} [params.language] - e.g. 'de-CH'
   * @returns {object|object[]} Accuracy metric(s)
   */
  async getAccuracy({ period, feature, language }) {
    const cacheKey = `ai:analytics:accuracy:${period}:${feature || 'all'}:${language || 'all'}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        if (feature && language) {
          const metric = await accuracyMetricRepository.findByPeriodAndFeature(period, feature, language);
          return metric ? [metric] : [];
        }
        return accuracyMetricRepository.findByPeriod(period);
      },
      ACCURACY_TTL,
    );
  }

  /**
   * Get usage statistics aggregated from voice sessions.
   *
   * @param {object} params
   * @param {string} params.dateFrom - ISO date string
   * @param {string} params.dateTo - ISO date string
   * @returns {object} Usage statistics
   */
  async getUsageStats({ dateFrom, dateTo }) {
    const { default: VoiceSession } = await import('./voiceSession.model.js');

    const matchStage = { isDeleted: false };
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo) matchStage.createdAt.$lte = new Date(dateTo);
    }

    const [totalResult, byTypeResult, byLanguageResult, avgTimeResult] = await Promise.all([
      // Total sessions
      VoiceSession.countDocuments(matchStage),

      // Sessions by type
      VoiceSession.aggregate([
        { $match: matchStage },
        { $group: { _id: '$sessionType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Sessions by language
      VoiceSession.aggregate([
        { $match: matchStage },
        { $group: { _id: '$language', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Average processing time (only for completed sessions)
      VoiceSession.aggregate([
        { $match: { ...matchStage, status: 'COMPLETED', processingTimeMs: { $ne: null } } },
        {
          $group: {
            _id: null,
            avgProcessingTimeMs: { $avg: '$processingTimeMs' },
            minProcessingTimeMs: { $min: '$processingTimeMs' },
            maxProcessingTimeMs: { $max: '$processingTimeMs' },
          },
        },
      ]),
    ]);

    const byType = {};
    for (const row of byTypeResult) {
      byType[row._id] = row.count;
    }

    const byLanguage = {};
    for (const row of byLanguageResult) {
      byLanguage[row._id] = row.count;
    }

    const processingTime = avgTimeResult[0] || {
      avgProcessingTimeMs: null,
      minProcessingTimeMs: null,
      maxProcessingTimeMs: null,
    };

    return {
      totalSessions: totalResult,
      sessionsByType: byType,
      sessionsByLanguage: byLanguage,
      processingTime: {
        avgMs: processingTime.avgProcessingTimeMs
          ? Math.round(processingTime.avgProcessingTimeMs)
          : null,
        minMs: processingTime.minProcessingTimeMs || null,
        maxMs: processingTime.maxProcessingTimeMs || null,
      },
      dateRange: { dateFrom: dateFrom || null, dateTo: dateTo || null },
    };
  }

  /**
   * Get the most frequently corrected terms.
   *
   * @param {object} params
   * @param {string} [params.language]
   * @param {number} [params.limit=20]
   * @returns {object[]} Top corrections
   */
  async getTopCorrections({ language, limit = 20 } = {}) {
    if (language) {
      return accuracyMetricRepository.getTopCorrections(language, limit);
    }

    // If no language specified, aggregate across all languages
    const { default: AccuracyMetric } = await import('./accuracyMetric.model.js');

    return AccuracyMetric.aggregate([
      { $unwind: '$topCorrections' },
      {
        $group: {
          _id: {
            original: '$topCorrections.original',
            correctedTo: '$topCorrections.correctedTo',
          },
          totalCount: { $sum: '$topCorrections.count' },
          feature: { $first: '$feature' },
          language: { $first: '$language' },
        },
      },
      { $sort: { totalCount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          original: '$_id.original',
          correctedTo: '$_id.correctedTo',
          count: '$totalCount',
          feature: 1,
          language: 1,
        },
      },
    ]);
  }

  /**
   * Aggregate monthly accuracy metrics for all feature/language combinations.
   * Called by the monthly aggregation job.
   *
   * @param {string} period - e.g. '2026-03'
   */
  async aggregateMonthlyMetrics(period) {
    logger.info('Starting monthly AI metrics aggregation', {
      module: 'ai',
      action: 'analytics.aggregate',
      period,
    });

    const { default: VoiceSession } = await import('./voiceSession.model.js');
    const { default: VoiceSessionEntity } = await import('./voiceSessionEntity.model.js');

    // Parse period to date range
    const [year, month] = period.split('-').map(Number);
    const dateFrom = new Date(year, month - 1, 1);
    const dateTo = new Date(year, month, 0, 23, 59, 59, 999);

    const dateFilter = {
      createdAt: { $gte: dateFrom, $lte: dateTo },
      isDeleted: false,
    };

    // Get all distinct languages used in the period
    const languages = await VoiceSession.distinct('language', dateFilter);

    for (const lang of languages) {
      const langFilter = { ...dateFilter, language: lang };

      // --- STT accuracy ---
      const sttTotal = await VoiceSession.countDocuments({
        ...langFilter,
        rawTranscript: { $ne: null },
      });

      const sttCorrected = await VoiceSession.countDocuments({
        ...langFilter,
        correctedTranscript: { $ne: null },
      });

      const sttCorrect = sttTotal - sttCorrected;
      const sttAccuracy = sttTotal > 0 ? sttCorrect / sttTotal : 0;

      const sttTopCorrections = await this._collectTranscriptCorrections(
        VoiceSession,
        langFilter,
      );

      await accuracyMetricRepository.upsert(period, 'STT', lang, {
        period,
        feature: 'STT',
        language: lang,
        totalInteractions: sttTotal,
        correctCount: sttCorrect,
        correctedCount: sttCorrected,
        accuracyRate: Math.round(sttAccuracy * 10000) / 10000,
        topCorrections: sttTopCorrections.slice(0, 50),
      });

      // --- Intent accuracy ---
      const intentTotal = await VoiceSession.countDocuments({
        ...langFilter,
        intentName: { $ne: null },
        status: { $in: ['COMPLETED', 'AWAITING_CONFIRMATION'] },
      });

      const intentCorrect = await VoiceSession.countDocuments({
        ...langFilter,
        intentName: { $ne: null },
        status: 'COMPLETED',
        correctedTranscript: null,
      });

      const intentCorrected = intentTotal - intentCorrect;
      const intentAccuracy = intentTotal > 0 ? intentCorrect / intentTotal : 0;

      await accuracyMetricRepository.upsert(period, 'INTENT', lang, {
        period,
        feature: 'INTENT',
        language: lang,
        totalInteractions: intentTotal,
        correctCount: intentCorrect,
        correctedCount: intentCorrected,
        accuracyRate: Math.round(intentAccuracy * 10000) / 10000,
        topCorrections: [],
      });

      // --- Entity extraction accuracy ---
      const entitySessionIds = await VoiceSession.distinct('_id', langFilter);

      if (entitySessionIds.length > 0) {
        const entityTotal = await VoiceSessionEntity.countDocuments({
          sessionId: { $in: entitySessionIds },
        });

        const entityCorrected = await VoiceSessionEntity.countDocuments({
          sessionId: { $in: entitySessionIds },
          correctedValue: { $ne: null },
        });

        const entityCorrect = entityTotal - entityCorrected;
        const entityAccuracy = entityTotal > 0 ? entityCorrect / entityTotal : 0;

        const entityTopCorrections = await this._collectEntityCorrections(
          VoiceSessionEntity,
          entitySessionIds,
        );

        await accuracyMetricRepository.upsert(period, 'ENTITY_EXTRACTION', lang, {
          period,
          feature: 'ENTITY_EXTRACTION',
          language: lang,
          totalInteractions: entityTotal,
          correctCount: entityCorrect,
          correctedCount: entityCorrected,
          accuracyRate: Math.round(entityAccuracy * 10000) / 10000,
          topCorrections: entityTopCorrections.slice(0, 50),
        });

        // --- Address parsing accuracy ---
        const addrTotal = await VoiceSessionEntity.countDocuments({
          sessionId: { $in: entitySessionIds },
          entityType: 'ADDRESS',
        });

        const addrCorrected = await VoiceSessionEntity.countDocuments({
          sessionId: { $in: entitySessionIds },
          entityType: 'ADDRESS',
          correctedValue: { $ne: null },
        });

        const addrCorrect = addrTotal - addrCorrected;
        const addrAccuracy = addrTotal > 0 ? addrCorrect / addrTotal : 0;

        await accuracyMetricRepository.upsert(period, 'ADDRESS_PARSING', lang, {
          period,
          feature: 'ADDRESS_PARSING',
          language: lang,
          totalInteractions: addrTotal,
          correctCount: addrCorrect,
          correctedCount: addrCorrected,
          accuracyRate: Math.round(addrAccuracy * 10000) / 10000,
          topCorrections: [],
        });
      }
    }

    // Invalidate accuracy caches for this period
    for (const feature of METRIC_FEATURES) {
      for (const lang of languages) {
        await cacheManager.del(`ai:analytics:accuracy:${period}:${feature}:${lang}`);
      }
      await cacheManager.del(`ai:analytics:accuracy:${period}:${feature}:all`);
    }
    await cacheManager.del(`ai:analytics:accuracy:${period}:all:all`);

    logger.info('Monthly AI metrics aggregation completed', {
      module: 'ai',
      action: 'analytics.aggregate',
      period,
      languageCount: languages.length,
    });
  }

  /**
   * Collect top transcript corrections by diffing original vs corrected text.
   */
  async _collectTranscriptCorrections(VoiceSession, langFilter) {
    const sessions = await VoiceSession.find({
      ...langFilter,
      correctedTranscript: { $ne: null },
    })
      .select('rawTranscript correctedTranscript')
      .limit(500)
      .lean();

    const correctionMap = new Map();

    for (const session of sessions) {
      const original = session.rawTranscript;
      const corrected = session.correctedTranscript;
      if (!original || !corrected || original === corrected) continue;

      // Find differing words
      const origWords = original.toLowerCase().split(/\s+/);
      const corrWords = corrected.toLowerCase().split(/\s+/);

      for (let i = 0; i < Math.min(origWords.length, corrWords.length); i++) {
        if (origWords[i] !== corrWords[i]) {
          const key = `${origWords[i]}|${corrWords[i]}`;
          correctionMap.set(key, (correctionMap.get(key) || 0) + 1);
        }
      }
    }

    return Array.from(correctionMap.entries())
      .map(([key, count]) => {
        const [original, correctedTo] = key.split('|');
        const maskedOriginal = this._maskAnalyticsToken(original);
        const maskedCorrected = this._maskAnalyticsToken(correctedTo);
        return {
          original: maskedOriginal,
          correctedTo: maskedCorrected,
          count,
          safeToPromote: maskedCorrected !== '<redacted>' && maskedCorrected.length > 1,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
  }

  /**
   * Collect top entity value corrections.
   */
  async _collectEntityCorrections(VoiceSessionEntity, sessionIds) {
    const corrected = await VoiceSessionEntity.find({
      sessionId: { $in: sessionIds },
      correctedValue: { $ne: null },
    })
      .select('value correctedValue entityType')
      .limit(500)
      .lean();

    const correctionMap = new Map();

    for (const entity of corrected) {
      if (entity.value === entity.correctedValue) continue;
      const key = `${entity.value}|${entity.correctedValue}`;
      correctionMap.set(key, (correctionMap.get(key) || 0) + 1);
    }

    return Array.from(correctionMap.entries())
      .map(([key, count]) => {
        const [original, correctedTo] = key.split('|');
        const maskedOriginal = this._maskAnalyticsToken(original);
        const maskedCorrected = this._maskAnalyticsToken(correctedTo);
        return {
          original: maskedOriginal,
          correctedTo: maskedCorrected,
          count,
          safeToPromote: maskedCorrected !== '<redacted>' && maskedCorrected.length > 1,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
  }

  _maskAnalyticsToken(value) {
    const text = String(value || '').trim();
    if (!text) return text;
    if (/@/.test(text) || /\d/.test(text) || /^\+?\d[\d\s()./-]+$/.test(text)) {
      return '<redacted>';
    }
    if (text.length <= 2) return text;
    return text;
  }
}

const aiAnalyticsService = new AiAnalyticsService();
export default aiAnalyticsService;
