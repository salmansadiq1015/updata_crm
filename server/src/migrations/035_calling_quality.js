import CallRecord from '../modules/aiCalling/callRecord.model.js';
import { BenchmarkSuite, BenchmarkCase, BenchmarkRun } from '../modules/aiCalling/benchmark.model.js';
import { AgentScriptVersion, ScriptActivation, ScriptExperiment } from '../modules/aiCalling/scriptExperiment.model.js';

/**
 * Calling quality, benchmarks and script experiments: indexes only. No data is
 * rewritten — calls placed before telemetry existed keep no `quality` field and are
 * reported as "not recorded".
 */
export const name = '035_calling_quality';
export async function up() {
  await Promise.all([BenchmarkSuite, BenchmarkCase, BenchmarkRun, AgentScriptVersion, ScriptActivation, ScriptExperiment].map(m => m.createIndexes()));
  // Experiment stats: calls of one experiment by arm.
  await CallRecord.collection.createIndex({ experimentId: 1, arm: 1, createdAt: -1 }, {
    partialFilterExpression: { experimentId: { $type: 'objectId' } }, name: 'experiment_arm_calls',
  });
  // Quality dashboard: owner's answered calls by time.
  await CallRecord.collection.createIndex({ createdBy: 1, answeredAt: 1, createdAt: -1 }, {
    partialFilterExpression: { answeredAt: { $type: 'date' } }, name: 'quality_answered_calls',
  });
}
export async function down() {
  await CallRecord.collection.dropIndex('experiment_arm_calls').catch(() => {});
  await CallRecord.collection.dropIndex('quality_answered_calls').catch(() => {});
  // Retain benchmark, version and experiment data: rollback never deletes user records.
}
export default { name, up, down };
