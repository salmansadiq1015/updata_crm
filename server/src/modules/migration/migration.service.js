import Customer from '../crm/customer.model.js';
import Contact from '../crm/contact.model.js';
import Site from '../crm/site.model.js';
import Installation from '../crm/installation.model.js';
import Quotation from '../qop/quotation.model.js';
import Invoice from '../qop/invoice.model.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import { toCsv, formatDateOnly } from '../../shared/utils/csv.js';
import migrationRepository from './migration.repository.js';
import migrationValidationService from './migrationValidation.service.js';
import migrationLoaderService from './migrationLoader.service.js';
import {
  DEFAULT_BATCH_SIZE,
  EXECUTABLE_DOMAINS,
  DOMAIN_SOURCE_SYSTEM,
  DOMAIN_SOURCE_TABLE,
  TARGET_TABLES,
} from './migration.constants.js';
import {
  assertRunMutable,
  calculateRate,
  getSourceId,
} from './migration.utils.js';

const TARGET_MODELS = {
  [TARGET_TABLES.customers]: Customer,
  [TARGET_TABLES.contacts]: Contact,
  [TARGET_TABLES.sites]: Site,
  [TARGET_TABLES.installations]: Installation,
  [TARGET_TABLES.quotations]: Quotation,
  [TARGET_TABLES.invoices]: Invoice,
};

const TARGET_URLS = {
  [TARGET_TABLES.customers]: '/admin/crm/customers',
  [TARGET_TABLES.contacts]: '/admin/crm/contacts',
  [TARGET_TABLES.sites]: '/admin/crm/sites',
  [TARGET_TABLES.installations]: '/admin/crm/installations',
  [TARGET_TABLES.quotations]: '/admin/qop/quotations',
  [TARGET_TABLES.invoices]: '/admin/qop/invoices',
};

function userIdFromRequest(user) {
  return user?._id || user?.id;
}

function pickDomainSourceRecords(sourceData = {}, domain) {
  return Array.isArray(sourceData[domain]) ? sourceData[domain] : [];
}

class MigrationService {
  async createRun(data, user) {
    const domains = data.domains?.length ? data.domains : EXECUTABLE_DOMAINS;
    const run = await migrationRepository.createRun({
      runType: data.runType,
      environment: data.environment,
      sourceDataDate: data.sourceDataDate,
      domains,
      config: {
        errorThresholdPercent: data.errorThresholdPercent,
        batchSize: data.batchSize,
        scopeFilter: data.scopeFilter || {},
        sourceDataRef: data.sourceDataRef || null,
        rollbackBackupRef: data.rollbackBackupRef || null,
      },
      notes: data.notes || '',
      createdBy: userIdFromRequest(user),
    });

    for (const domain of domains) {
      await migrationRepository.upsertDomainStatus(run._id, domain, { status: 'pending' });
      const records = pickDomainSourceRecords(data.sourceData, domain);
      if (records.length) await migrationRepository.addSourceRecords(run._id, domain, records);
      const totalSource = await migrationRepository.countSourceRecords(run._id, domain);
      await migrationRepository.upsertDomainStatus(run._id, domain, { totalSource });
    }

    return this.getRun(run._id);
  }

  async addSourceRecords(runId, domain, records) {
    const run = await this.requireRun(runId);
    if (!assertRunMutable(run)) throw new AppError('Source records can only be added before a run starts or while paused', 409, ERROR_CODES.CONFLICT);
    if (!run.domains.includes(domain)) throw new AppError(`Domain ${domain} is not part of this run`, 400, ERROR_CODES.VALIDATION_ERROR);

    const result = await migrationRepository.addSourceRecords(runId, domain, records);
    const totalSource = await migrationRepository.countSourceRecords(runId, domain);
    await migrationRepository.upsertDomainStatus(runId, domain, { totalSource });
    return { ...result, totalSource };
  }

  async listRuns(filters) {
    return migrationRepository.listRuns(filters);
  }

  async getRun(runId) {
    const run = await this.requireRun(runId);
    const domainStatuses = await migrationRepository.listDomainStatuses(runId);
    return { ...run, domainStatuses };
  }

  async getProgress(runId) {
    const run = await this.requireRun(runId);
    const domainStatuses = await migrationRepository.listDomainStatuses(runId);
    const totals = domainStatuses.reduce((acc, status) => {
      acc.totalSource += status.totalSource || 0;
      acc.processed += status.processed || 0;
      acc.failed += status.failed || 0;
      acc.migratedOk += status.migratedOk || 0;
      acc.migratedWarning += status.migratedWarning || 0;
      return acc;
    }, { totalSource: 0, processed: 0, failed: 0, migratedOk: 0, migratedWarning: 0 });
    return {
      runId,
      status: run.status,
      totals: {
        ...totals,
        progressPercent: calculateRate(totals.processed, totals.totalSource),
        errorRate: calculateRate(totals.failed, totals.processed),
      },
      domains: domainStatuses,
    };
  }

  async start(runId, user) {
    const run = await this.requireRun(runId);
    if (!['pending', 'paused'].includes(run.status)) {
      throw new AppError('Migration run cannot be started from its current status', 409, ERROR_CODES.CONFLICT);
    }

    await migrationRepository.updateRun(runId, {
      status: 'running',
      startedAt: run.startedAt || new Date(),
      startedBy: userIdFromRequest(user),
      updatedBy: userIdFromRequest(user),
      pausedAt: null,
    });

    try {
      for (const domain of run.domains) {
        const currentRun = await this.requireRun(runId);
        if (currentRun.status === 'cancelled') break;
        if (currentRun.status === 'paused') return this.getRun(runId);
        await this.processDomain(currentRun, domain);
      }
      const progress = await this.getProgress(runId);
      const failed = progress.domains.some((domain) => domain.status === 'failed');
      await migrationRepository.updateRun(runId, {
        status: failed ? 'failed' : 'completed',
        completedAt: new Date(),
        failureReason: failed ? 'One or more migration domains exceeded the error threshold' : null,
        updatedBy: userIdFromRequest(user),
      });
    } catch (error) {
      await migrationRepository.updateRun(runId, {
        status: 'failed',
        completedAt: new Date(),
        failureReason: error.message,
        updatedBy: userIdFromRequest(user),
      });
      throw error;
    }

    return this.getRun(runId);
  }

  async processDomain(run, domain) {
    const batchSize = run.config?.batchSize || DEFAULT_BATCH_SIZE;
    const totalSource = await migrationRepository.countSourceRecords(run._id, domain);
    await migrationRepository.upsertDomainStatus(run._id, domain, {
      status: totalSource ? 'running' : 'skipped',
      totalSource,
      startedAt: new Date(),
    });
    if (!totalSource) return;

    let counters = {
      processed: 0,
      migratedOk: 0,
      migratedWarning: 0,
      failed: 0,
      skipped: 0,
      deduplicationMerged: 0,
    };

    for (let offset = 0; offset < totalSource; offset += batchSize) {
      const records = await migrationRepository.listSourceRecords(run._id, domain, { offset, limit: batchSize });
      for (const [index, sourceRecord] of records.entries()) {
        const globalIndex = offset + index;
        const result = await this.processRecord(run, domain, sourceRecord, globalIndex);
        counters = this.mergeCounters(counters, result);
      }
      await this.persistDomainCounters(run, domain, totalSource, counters, 'running');
    }

    const errorRate = calculateRate(counters.failed, counters.processed);
    const failed = errorRate > (run.config?.errorThresholdPercent ?? 5);
    await this.persistDomainCounters(run, domain, totalSource, counters, failed ? 'failed' : 'completed', failed ? 'Domain exceeded migration error threshold' : null);
  }

  async processRecord(run, domain, sourceRecord, index) {
    const payload = sourceRecord.payload || {};
    const sourceSystem = DOMAIN_SOURCE_SYSTEM[domain];
    const sourceTable = DOMAIN_SOURCE_TABLE[domain];
    const sourceId = getSourceId(payload, domain, index);
    const validationIssues = migrationValidationService.validate(domain, payload);
    await this.logIssues(run._id, domain, sourceSystem, sourceTable, sourceId, payload, validationIssues);

    if (migrationValidationService.hasBlockingErrors(validationIssues)) {
      return { processed: 1, failed: 1 };
    }

    try {
      const loadResult = await migrationLoaderService.load(domain, run, sourceRecord, index);
      await this.logIssues(run._id, domain, sourceSystem, sourceTable, sourceId, payload, loadResult.issues || []);
      const warnings = [...validationIssues, ...(loadResult.issues || [])].some((issue) => issue.severity !== 'info');
      return {
        processed: 1,
        migratedOk: loadResult.action === 'skipped' ? 0 : warnings ? 0 : 1,
        migratedWarning: loadResult.action === 'skipped' ? 0 : warnings ? 1 : 0,
        skipped: loadResult.action === 'skipped' ? 1 : 0,
        deduplicationMerged: loadResult.action === 'merged' ? 1 : 0,
      };
    } catch (error) {
      await this.logIssues(run._id, domain, sourceSystem, sourceTable, sourceId, payload, [{
        severity: 'error',
        errorType: 'mapping_error',
        errorField: 'record',
        errorMessage: error.message,
      }]);
      return { processed: 1, failed: 1 };
    }
  }

  mergeCounters(counters, result) {
    return Object.fromEntries(Object.keys(counters).map((key) => [key, counters[key] + (result[key] || 0)]));
  }

  async persistDomainCounters(run, domain, totalSource, counters, status, failureReason = null) {
    await migrationRepository.upsertDomainStatus(run._id, domain, {
      ...counters,
      totalSource,
      status,
      failureReason,
      errorRate: calculateRate(counters.failed, counters.processed),
      processingRate: calculateRate(counters.processed, totalSource),
      completedAt: ['completed', 'failed', 'skipped'].includes(status) ? new Date() : null,
    });
  }

  async logIssues(runId, domain, sourceSystem, sourceTable, sourceId, payload, issues = []) {
    for (const item of issues) {
      await migrationRepository.logIssue({
        runId,
        domain,
        sourceSystem,
        sourceTable,
        sourceId,
        severity: item.severity,
        errorType: item.errorType || 'unknown',
        errorField: item.errorField || null,
        errorMessage: item.errorMessage,
        sourceValue: item.sourceValue === undefined ? null : String(item.sourceValue),
        suggestedFix: item.suggestedFix || null,
      });
    }
  }

  async pause(runId, user) {
    const run = await this.requireRun(runId);
    if (run.status !== 'running') throw new AppError('Only running migrations can be paused', 409, ERROR_CODES.CONFLICT);
    return migrationRepository.updateRun(runId, { status: 'paused', pausedAt: new Date(), updatedBy: userIdFromRequest(user) });
  }

  async resume(runId, user) {
    const run = await this.requireRun(runId);
    if (run.status !== 'paused') throw new AppError('Only paused migrations can be resumed', 409, ERROR_CODES.CONFLICT);
    return this.start(runId, user);
  }

  async cancel(runId, user) {
    const run = await this.requireRun(runId);
    if (!['pending', 'running', 'paused'].includes(run.status)) throw new AppError('Migration run cannot be cancelled', 409, ERROR_CODES.CONFLICT);
    return migrationRepository.updateRun(runId, { status: 'cancelled', cancelledAt: new Date(), updatedBy: userIdFromRequest(user) });
  }

  async rollback(runId, data, user) {
    const run = await this.requireRun(runId);
    if (run.runType !== 'production') throw new AppError('Only production migration runs need rollback', 409, ERROR_CODES.CONFLICT);
    const domains = data.rollbackType === 'partial' ? data.domains : run.domains;
    const maps = [];
    for (const domain of domains) {
      maps.push(...await migrationRepository.findRecordMaps(runId, { domain }));
    }

    let rolledBack = 0;
    for (const map of maps.reverse()) {
      const Model = TARGET_MODELS[map.targetTable];
      if (!Model) continue;
      await Model.findByIdAndUpdate(map.targetId, {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          'migration.rolledBackAt': new Date(),
          'migration.rolledBackBy': userIdFromRequest(user),
        },
      }, { includeDeleted: true });
      await migrationRepository.markRecordMapRolledBack(map._id);
      rolledBack += 1;
    }

    const updated = await migrationRepository.updateRun(runId, {
      status: 'rolled_back',
      rolledBackAt: new Date(),
      updatedBy: userIdFromRequest(user),
      'config.rollbackBackupRef': data.rollbackBackupRef || run.config?.rollbackBackupRef || null,
    });
    return { run: updated, rolledBack };
  }

  async listErrors(runId, filters) {
    await this.requireRun(runId);
    return migrationRepository.listErrors(runId, filters);
  }

  async exportErrorsCsv(runId, filters) {
    const result = await this.listErrors(runId, { ...filters, page: 1, pageSize: 5000 });
    return toCsv(
      ['domain', 'severity', 'sourceSystem', 'sourceTable', 'sourceId', 'errorType', 'errorField', 'errorMessage', 'suggestedFix', 'createdAt'],
      result.data.map((row) => ({
        ...row,
        createdAt: formatDateOnly(row.createdAt),
      })),
    );
  }

  async validationReport(runId) {
    const [progress, errors] = await Promise.all([
      this.getProgress(runId),
      migrationRepository.aggregateErrors(runId),
    ]);
    return {
      runId,
      status: progress.status,
      totals: progress.totals,
      domains: progress.domains,
      errors,
      signOff: {
        readyForSpotCheck: progress.status === 'completed' && progress.totals.errorRate <= 5,
        requiresRollback: progress.status === 'failed',
      },
    };
  }

  async generateSpotCheck(runId, data, user) {
    await this.requireRun(runId);
    const domains = data.domains?.length ? data.domains : EXECUTABLE_DOMAINS;
    const sampleSize = data.sampleSizePerDomain || 10;
    const samples = [];
    for (const domain of domains) {
      const maps = await migrationRepository.findRecordMaps(runId, { domain });
      for (const map of maps.slice(0, sampleSize)) {
        samples.push({
          domain,
          sourceSystem: map.sourceSystem,
          sourceTable: map.sourceTable,
          sourceId: map.sourceId,
          targetTable: map.targetTable,
          targetId: map.targetId,
          targetUrl: `${TARGET_URLS[map.targetTable] || '/admin/migration/records'}/${map.targetId}`,
          result: 'pending',
        });
      }
    }
    return migrationRepository.createSpotCheck({
      runId,
      sampleSizePerDomain: sampleSize,
      domains,
      samples,
      generatedBy: userIdFromRequest(user),
    });
  }

  async requireRun(runId) {
    const run = await migrationRepository.findRunById(runId);
    if (!run) throw new NotFoundError('MigrationRun', runId);
    return run;
  }
}

const migrationService = new MigrationService();
export default migrationService;
