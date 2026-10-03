import leadRepository from './lead.repository.js';
import LeadEnrichmentJob, { LEAD_ENRICHMENT_JOB_STATUS } from './leadEnrichmentJob.model.js';
import { LEAD_ENRICHMENT_STATUS } from './lead.model.js';
import websiteScraper from '../businessDiscovery/engine/websiteScraper.js';
import { normalizeWebsiteDomain } from '../businessDiscovery/engine/normalizer.js';
import queueManager from '../../shared/queue/QueueManager.js';
import auditService from '../auth/audit.service.js';
import config from '../../config/index.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

/**
 * Lead website-enrichment service (§lead module).
 *
 * Fills MISSING business-contact fields on a lead (email / phone / social links)
 * from the lead's own website, using the responsible {@link websiteScraper}. It
 * NEVER overwrites data a user already entered, only fills blanks, and records a
 * per-lead audit trail under `lead.enrichment`. Bulk runs are handed to the
 * `lead-enrichment` BullMQ queue and tracked by a LeadEnrichmentJob document.
 */

// Social platforms we persist, matching lead.model.js `social`.
const SOCIAL_KEYS = ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiktok'];

// Minimum gap between two requests to the SAME host during a bulk run (politeness).
const DEFAULT_POLITE_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

class LeadEnrichmentService {
  /**
   * Enrich a single lead from its website. Loads the lead, marks it `running`,
   * scrapes the site, then fills ONLY the fields that are currently empty
   * (email, phone/normalizedPhone, each social link). Always records the run
   * under `lead.enrichment`. A dead/blocked site does NOT throw: it resolves to a
   * result whose enrichment status is `failed` (fetch failure) or `done`
   * (robots-disallow skip / nothing found).
   *
   * @returns {Promise<{lead:object, found:{emails:string[],phones:string[],social:object},
   *   applied:{email:(string|null),phones:string[],socials:string[]},
   *   enriched:boolean, skipped:boolean, failed:boolean}>}
   */
  async enrichLead(leadId, actor, meta = {}, { scraper = websiteScraper, onBeforeScrape } = {}) {
    const lead = await leadRepository.getById(leadId);
    if (!lead) throw new NotFoundError('Lead', leadId);
    if (!lead.website) {
      throw new AppError('No website to enrich', 400, ERROR_CODES.INVALID_INPUT);
    }

    // Visible "in progress" marker (dot-path $set keeps sibling enrichment fields).
    await leadRepository.update(leadId, { 'enrichment.status': LEAD_ENRICHMENT_STATUS.RUNNING });

    if (typeof onBeforeScrape === 'function') {
      // normalizeWebsiteDomain gives a stable host key for the per-host throttle.
      try { await onBeforeScrape(normalizeWebsiteDomain(lead.website)); } catch { /* throttle must not break enrichment */ }
    }

    let scrape;
    try {
      scrape = await scraper.scrapeSite(lead.website);
    } catch (err) {
      // scrapeSite is contracted never to throw; stay defensive anyway.
      scrape = {
        emails: [], phones: [], social: {}, pagesFetched: 0, error: String(err?.message || 'scrape_error').slice(0, 120),
      };
    }

    const found = {
      emails: scrape.emails || [],
      phones: scrape.phones || [],
      social: scrape.social || {},
    };
    const applied = { email: null, phones: [], socials: [] };

    const isFailure = !scrape.skipped && !!scrape.error;
    const isSkipped = !!scrape.skipped;

    const update = {
      'enrichment.enrichedAt': new Date(),
      'enrichment.source': 'website',
      'enrichment.foundEmails': found.emails,
      'enrichment.foundPhones': found.phones,
    };

    if (isFailure) {
      update['enrichment.status'] = LEAD_ENRICHMENT_STATUS.FAILED;
      update['enrichment.error'] = String(scrape.error).slice(0, 500);
      update['enrichment.foundEmails'] = [];
      update['enrichment.foundPhones'] = [];
    } else {
      update['enrichment.status'] = LEAD_ENRICHMENT_STATUS.DONE;
      // A robots-disallow skip is a successful (empty) run; leave a breadcrumb.
      update['enrichment.error'] = isSkipped ? (scrape.reason || 'skipped') : null;

      if (!isSkipped) {
        // Fill ONLY missing fields.
        if (!lead.email && found.emails.length) {
          [applied.email] = found.emails;
          update.email = applied.email;
        }
        if (!lead.phone && found.phones.length) {
          const [phone] = found.phones;
          update.phone = phone; // E.164 is a valid, display-safe value
          if (!lead.normalizedPhone) update.normalizedPhone = phone;
          applied.phones = [phone];
        }
        for (const key of SOCIAL_KEYS) {
          if (!lead.social?.[key] && found.social[key]) {
            update[`social.${key}`] = found.social[key];
            applied.socials.push(key);
          }
        }
      }
    }

    const updated = await leadRepository.update(leadId, update);
    const resultLead = updated || lead;

    const enriched = !!(applied.email || applied.phones.length || applied.socials.length);

    auditService.logEvent({
      eventType: 'lead.enriched',
      userId: actor,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: isFailure ? 'failure' : 'success',
      details: {
        leadId,
        status: update['enrichment.status'],
        pagesFetched: scrape.pagesFetched || 0,
        foundEmails: found.emails.length,
        foundPhones: found.phones.length,
        applied: { email: !!applied.email, phones: applied.phones.length, socials: applied.socials },
        ...(isSkipped ? { skipped: true, reason: scrape.reason || 'skipped' } : {}),
        ...(isFailure ? { error: update['enrichment.error'] } : {}),
      },
      module: 'lead',
    });

    logger.info('Lead enriched', {
      module: 'crm',
      action: 'lead.enrich',
      leadId,
      status: update['enrichment.status'],
      enriched,
      pagesFetched: scrape.pagesFetched || 0,
    });

    return {
      lead: resultLead, found, applied, enriched, skipped: isSkipped, failed: isFailure,
    };
  }

  /**
   * Queue a bulk website-enrichment run. Creates a LeadEnrichmentJob, enqueues
   * the `lead-enrichment` worker and returns its id (the route answers 202).
   */
  async enrichLeadsBulk(leadIds = [], actor, meta = {}) {
    const ids = [...new Set((leadIds || []).map((id) => String(id)))];

    const job = await LeadEnrichmentJob.create({
      createdBy: actor,
      leadIds: ids,
      status: LEAD_ENRICHMENT_JOB_STATUS.QUEUED,
      counts: { total: ids.length },
    });

    await queueManager.addJob('lead-enrichment', `lead-enrichment-${job._id}`, {
      enrichmentJobId: job._id.toString(),
      createdBy: actor?.toString?.() ?? actor,
    });

    auditService.logEvent({
      eventType: 'lead.bulk_enrich_queued',
      userId: actor,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { enrichmentJobId: job._id, total: ids.length },
      module: 'lead',
    });

    logger.info('Lead enrichment job queued', {
      module: 'crm', action: 'lead.enrich.queue', enrichmentJobId: job._id, total: ids.length,
    });

    return { jobId: job._id };
  }

  /** Fetch a lead-enrichment job (scoped to its owner) as a DTO. */
  async getEnrichJob(jobId, actor) {
    const filter = { _id: jobId };
    if (actor) filter.createdBy = actor;
    const job = await LeadEnrichmentJob.findOne(filter).lean();
    if (!job) throw new NotFoundError('Lead enrichment job', jobId);
    return this.toEnrichJobDTO(job);
  }

  toEnrichJobDTO(job) {
    if (!job) return null;
    return {
      id: job._id,
      status: job.status,
      counts: job.counts,
      leadIds: job.leadIds,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  /**
   * Execute a queued bulk enrichment job (called by the worker). Iterates the
   * job's leadIds in BOUNDED concurrency, enriches each with a per-lead
   * try/catch and a politeness delay between requests to the same host, keeps the
   * job counts + progress fresh, and finalizes COMPLETED / PARTIAL / FAILED.
   *
   * @param {string} jobId
   * @param {object} [opts]
   * @param {object} [opts.scraper]        scraper to use (injected in tests)
   * @param {Function} [opts.onProgress]   async (percent) => void (BullMQ progress)
   * @param {number} [opts.concurrency]    override config.enrichment.concurrency
   * @param {number} [opts.politeDelayMs]  override the same-host politeness delay
   */
  async runEnrichmentJob(jobId, {
    scraper = websiteScraper,
    onProgress,
    concurrency = config.enrichment.concurrency,
    politeDelayMs = DEFAULT_POLITE_DELAY_MS,
  } = {}) {
    const jobDoc = await LeadEnrichmentJob.findById(jobId).lean();
    if (!jobDoc) {
      logger.warn('Lead enrichment job not found — nothing to process', {
        module: 'crm', action: 'lead.enrich.run', enrichmentJobId: jobId,
      });
      return { enrichmentJobId: jobId, skipped: true };
    }

    const actor = jobDoc.createdBy;
    const ids = jobDoc.leadIds || [];
    const total = ids.length;
    const counts = {
      total, processed: 0, enriched: 0, skipped: 0, failed: 0,
    };

    try {
      await LeadEnrichmentJob.findByIdAndUpdate(jobId, {
        status: LEAD_ENRICHMENT_JOB_STATUS.RUNNING,
        startedAt: new Date(),
        'counts.total': total,
      });

      // Per-host politeness throttle, shared across the bounded-concurrency pool.
      const lastHostAt = new Map();
      const onBeforeScrape = async (host) => {
        if (!host || politeDelayMs <= 0) return;
        const prev = lastHostAt.get(host);
        if (prev) {
          const wait = politeDelayMs - (Date.now() - prev);
          if (wait > 0) await sleep(wait);
        }
        lastHostAt.set(host, Date.now());
      };

      await this._runPool(ids, concurrency, async (leadId) => {
        let outcome = 'skipped';
        try {
          const r = await this.enrichLead(leadId, actor, { ipAddress: 'internal' }, { scraper, onBeforeScrape });
          if (r.failed) outcome = 'failed';
          else if (r.skipped) outcome = 'skipped';
          else if (r.enriched) outcome = 'enriched';
          else outcome = 'skipped'; // scraped, nothing new to fill
        } catch (err) {
          // A lead without a website (400) is skipped, not a failure.
          outcome = err.statusCode === 400 ? 'skipped' : 'failed';
          logger.warn('Lead enrichment (bulk) item failed', {
            module: 'crm', action: 'lead.enrich.bulk', leadId, error: { message: err.message },
          });
        }

        counts.processed += 1;
        counts[outcome] += 1;

        await LeadEnrichmentJob.findByIdAndUpdate(jobId, {
          'counts.processed': counts.processed,
          'counts.enriched': counts.enriched,
          'counts.skipped': counts.skipped,
          'counts.failed': counts.failed,
        });
        if (typeof onProgress === 'function') {
          await onProgress(Math.round((counts.processed / Math.max(total, 1)) * 100));
        }
      });

      let finalStatus = LEAD_ENRICHMENT_JOB_STATUS.COMPLETED;
      if (counts.failed > 0) {
        finalStatus = counts.failed >= total
          ? LEAD_ENRICHMENT_JOB_STATUS.FAILED
          : LEAD_ENRICHMENT_JOB_STATUS.PARTIAL;
      }

      await LeadEnrichmentJob.findByIdAndUpdate(jobId, {
        status: finalStatus,
        completedAt: new Date(),
        'counts.total': total,
        'counts.processed': counts.processed,
        'counts.enriched': counts.enriched,
        'counts.skipped': counts.skipped,
        'counts.failed': counts.failed,
        log: `Enrichment ${finalStatus}: enriched ${counts.enriched}, skipped ${counts.skipped}, failed ${counts.failed} of ${total}.`,
      });

      auditService.logEvent({
        eventType: 'lead.bulk_enrich_completed',
        userId: actor,
        ipAddress: 'internal',
        result: counts.failed > 0 ? 'partial' : 'success',
        details: { enrichmentJobId: jobId, ...counts },
        module: 'lead',
      });

      logger.info('Lead enrichment job finished', {
        module: 'crm', action: 'lead.enrich.run', enrichmentJobId: jobId, status: finalStatus, ...counts,
      });

      return { enrichmentJobId: jobId, status: finalStatus, ...counts };
    } catch (err) {
      await LeadEnrichmentJob.findByIdAndUpdate(jobId, {
        status: LEAD_ENRICHMENT_JOB_STATUS.FAILED,
        completedAt: new Date(),
        error: { code: String(err.code || ERROR_CODES.INTERNAL_ERROR), message: err.message },
        log: `Enrichment failed: ${err.message}`,
      });

      logger.error('Lead enrichment job failed', {
        module: 'crm', action: 'lead.enrich.run', enrichmentJobId: jobId, error: { message: err.message, stack: err.stack },
      });

      throw err;
    }
  }

  /** Run `task` over `items` with at most `concurrency` in flight. */
  async _runPool(items, concurrency, task) {
    const queue = [...items];
    const lanes = Math.max(1, Math.min(concurrency || 1, queue.length || 1));
    const runLane = async () => {
      while (queue.length) {
        const item = queue.shift();
        await task(item);
      }
    };
    await Promise.all(Array.from({ length: lanes }, () => runLane()));
  }
}

const leadEnrichmentService = new LeadEnrichmentService();
export default leadEnrichmentService;
