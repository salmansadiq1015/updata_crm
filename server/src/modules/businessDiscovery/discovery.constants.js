/**
 * Version the queue and persisted provider strategy together. During a rolling
 * deployment this prevents an older, single-query worker from consuming jobs
 * created by the adaptive coverage service.
 */
export const DISCOVERY_QUEUE_NAME = 'discovery-run-v2';
export const DISCOVERY_JOB_NAME = 'discovery-run-v2';
export const DISCOVERY_PROVIDER_VERSION = 'adaptive-v2';

export default {
  DISCOVERY_QUEUE_NAME,
  DISCOVERY_JOB_NAME,
  DISCOVERY_PROVIDER_VERSION,
};
