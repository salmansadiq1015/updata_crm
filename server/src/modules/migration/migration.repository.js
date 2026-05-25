import crypto from 'crypto';
import mongoose from 'mongoose';
import MigrationRun from './migrationRun.model.js';
import MigrationDomainStatus from './migrationDomainStatus.model.js';
import MigrationError from './migrationError.model.js';
import MigrationRecordMap from './migrationRecordMap.model.js';
import MigrationSourceRecord from './migrationSourceRecord.model.js';
import MigrationSpotCheck from './migrationSpotCheck.model.js';
import {
  DOMAIN_SOURCE_SYSTEM,
  DOMAIN_SOURCE_TABLE,
} from './migration.constants.js';

function stableHash(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

class MigrationRepository {
  async createRun(data) {
    const run = new MigrationRun(data);
    return run.save();
  }

  async findRunById(id) {
    return MigrationRun.findById(id).lean();
  }

  async updateRun(id, data) {
    return MigrationRun.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async listRuns({ limit = 25, status, environment, runType } = {}) {
    const filter = {};
    if (status) filter.status = status;
    if (environment) filter.environment = environment;
    if (runType) filter.runType = runType;

    return MigrationRun.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async upsertDomainStatus(runId, domain, data = {}) {
    return MigrationDomainStatus.findOneAndUpdate(
      { runId, domain },
      { $set: { runId, domain, ...data } },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async incrementDomainStatus(runId, domain, increments = {}, set = {}) {
    return MigrationDomainStatus.findOneAndUpdate(
      { runId, domain },
      {
        $inc: increments,
        $set: set,
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async listDomainStatuses(runId) {
    return MigrationDomainStatus.find({ runId }).sort({ domain: 1 }).lean();
  }

  async addSourceRecords(runId, domain, records) {
    if (!records?.length) return { inserted: 0, updated: 0 };

    const sourceSystem = DOMAIN_SOURCE_SYSTEM[domain] || 'other';
    const sourceTable = DOMAIN_SOURCE_TABLE[domain] || domain;
    const operations = records.map((payload, index) => {
      const sourceId = String(payload.source_id || payload.sourceId || payload.id || payload._id || `${domain}-${index + 1}`);
      return {
        updateOne: {
          filter: { runId, domain, sourceSystem, sourceTable, sourceId },
          update: {
            $set: {
              payload,
              payloadHash: stableHash(payload),
            },
            $setOnInsert: {
              runId,
              domain,
              sourceSystem,
              sourceTable,
              sourceId,
            },
          },
          upsert: true,
        },
      };
    });

    const result = await MigrationSourceRecord.bulkWrite(operations, { ordered: false });
    return {
      inserted: result.upsertedCount || 0,
      updated: result.modifiedCount || 0,
    };
  }

  async countSourceRecords(runId, domain) {
    return MigrationSourceRecord.countDocuments({ runId, domain });
  }

  async listSourceRecords(runId, domain, { offset = 0, limit = 500 } = {}) {
    return MigrationSourceRecord.find({ runId, domain })
      .sort({ createdAt: 1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .lean();
  }

  async logIssue(data) {
    const issue = new MigrationError(data);
    return issue.save();
  }

  async listErrors(runId, filters = {}) {
    const { domain, severity, errorType, page = 1, pageSize = 50 } = filters;
    const query = { runId };
    if (domain) query.domain = domain;
    if (severity) query.severity = severity;
    if (errorType) query.errorType = errorType;

    const [data, total] = await Promise.all([
      MigrationError.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      MigrationError.countDocuments(query),
    ]);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    };
  }

  async aggregateErrors(runId) {
    const matchRunId = mongoose.Types.ObjectId.isValid(runId)
      ? new mongoose.Types.ObjectId(runId)
      : runId;
    const [bySeverity, byType, byDomain] = await Promise.all([
      MigrationError.aggregate([
        { $match: { runId: matchRunId } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      MigrationError.aggregate([
        { $match: { runId: matchRunId } },
        { $group: { _id: '$errorType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      MigrationError.aggregate([
        { $match: { runId: matchRunId } },
        { $group: { _id: { domain: '$domain', severity: '$severity' }, count: { $sum: 1 } } },
      ]),
    ]);

    return { bySeverity, byType, byDomain };
  }

  async findRecordMap(sourceSystem, sourceTable, sourceId, targetTable) {
    return MigrationRecordMap.findOne({
      sourceSystem,
      sourceTable,
      sourceId,
      targetTable,
      rolledBackAt: null,
    }).lean();
  }

  async upsertRecordMap(data) {
    return MigrationRecordMap.findOneAndUpdate(
      {
        sourceSystem: data.sourceSystem,
        sourceTable: data.sourceTable,
        sourceId: data.sourceId,
        targetTable: data.targetTable,
      },
      {
        $set: {
          ...data,
          rolledBackAt: null,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async findRecordMaps(runId, filters = {}) {
    const query = { runId, rolledBackAt: null };
    if (filters.domain) query.domain = filters.domain;
    if (filters.targetTable) query.targetTable = filters.targetTable;
    return MigrationRecordMap.find(query).sort({ createdAt: 1 }).lean();
  }

  async markRecordMapRolledBack(id) {
    return MigrationRecordMap.findByIdAndUpdate(
      id,
      { action: 'rolled_back', rolledBackAt: new Date() },
      { returnDocument: 'after' },
    ).lean();
  }

  async createSpotCheck(data) {
    const spotCheck = new MigrationSpotCheck(data);
    return spotCheck.save();
  }
}

const migrationRepository = new MigrationRepository();
export default migrationRepository;
