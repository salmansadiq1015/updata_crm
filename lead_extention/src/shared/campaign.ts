import type {
  BusinessTypeTask,
  DiscoveryCampaign,
  DiscoveryConfig,
  DiscoveryPhase,
  SearchRecord,
} from './types';

export const MAX_BUSINESS_TYPE_ATTEMPTS = 3;

/** Each type gets the configured maximum; preserve old shared-limit checkpoints. */
export function allocateTaskBudget(campaign: DiscoveryCampaign, task: BusinessTypeTask): number {
  if (campaign.perTypeMaxResults !== undefined) {
    task.newResultLimit = campaign.perTypeMaxResults;
    return task.newResultLimit;
  }
  if (task.newResultLimit !== undefined) return task.newResultLimit;
  const runnable = campaign.tasks.filter((item) => item.status === 'pending' || item.status === 'running');
  const targets = new Map(runnable.map((item) => [item.id, item.newCount]));
  const available = Math.max(0, Math.floor(campaign.globalMaxResults - campaign.uniqueCount));
  // Give each next slot to the least represented runnable type, including
  // partial retries and types receiving spare slots after a sparse result set.
  for (let slot = 0; slot < available && runnable.length; slot += 1) {
    const least = runnable.reduce((a, b) => targets.get(a.id)! <= targets.get(b.id)! ? a : b);
    targets.set(least.id, targets.get(least.id)! + 1);
  }
  task.newResultLimit = targets.get(task.id) ?? task.newCount;
  return task.newResultLimit;
}

export function hasTaskCapacity(campaign: DiscoveryCampaign, uniqueCount = campaign.uniqueCount): boolean {
  if (uniqueCount >= campaign.globalMaxResults) return false;
  const task = campaign.tasks[campaign.queueIndex];
  return !task || task.newResultLimit === undefined || task.newCount < task.newResultLimit;
}

export function reopenCappedTasks(campaign: DiscoveryCampaign): boolean {
  if (campaign.perTypeMaxResults !== undefined) return false;
  if (campaign.uniqueCount >= campaign.globalMaxResults) return false;
  const capped = campaign.tasks.filter((task) => ['completed', 'completed-with-errors'].includes(task.status)
    && task.newResultLimit !== undefined && task.newResultLimit > 0 && task.newCount >= task.newResultLimit);
  if (!capped.length) return false;
  for (const task of capped) {
    task.status = 'pending';
    task.completedAt = null;
    delete task.newResultLimit;
  }
  campaign.queueIndex = capped[0].order;
  return true;
}

export function campaignRetryError(campaign: DiscoveryCampaign, businessType?: string): string | null {
  const task = campaign.tasks.find((item) => item.businessType.toLocaleLowerCase() === businessType?.trim().toLocaleLowerCase());
  if (task && campaign.perTypeMaxResults !== undefined && task.newCount >= campaign.perTypeMaxResults) {
    return `${task.businessType} already has its ${campaign.perTypeMaxResults.toLocaleString()} unique-business limit. Start a new campaign to search for more.`;
  }
  return campaign.uniqueCount >= campaign.globalMaxResults
    ? `This campaign already has its ${campaign.globalMaxResults.toLocaleString()}-business total. Start a new campaign to apply the maximum to each selected business type. Saved results will remain in History.`
    : null;
}

export function normalizeBusinessTypes(config: Pick<DiscoveryConfig, 'businessType' | 'businessTypes'>): string[] {
  const source = config.businessTypes?.length ? config.businessTypes : [config.businessType];
  const seen = new Set<string>();
  const types: string[] = [];
  for (const value of source) {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    types.push(cleaned);
  }
  return types;
}

export function createCampaign(
  id: string,
  businessTypes: string[],
  perTypeMaxResults: number,
  timestamp = new Date().toISOString(),
): DiscoveryCampaign {
  return {
    id,
    status: 'queued',
    selectedBusinessTypes: [...businessTypes],
    queueIndex: 0,
    currentBusinessType: null,
    tasks: businessTypes.map((businessType, order) => createTask(id, businessType, order)),
    perTypeMaxResults,
    globalMaxResults: perTypeMaxResults * businessTypes.length,
    uniqueCount: 0,
    duplicateCount: 0,
    invalidCount: 0,
    enrichmentTotal: 0,
    enrichmentCompleted: 0,
    enrichmentFailed: 0,
    startedAt: timestamp,
    completedAt: null,
    updatedAt: timestamp,
    lastCheckpointAt: timestamp,
    stopRequested: false,
  };
}

function createTask(campaignId: string, businessType: string, order: number): BusinessTypeTask {
  return {
    id: `${campaignId}:${order}`,
    businessType,
    order,
    status: 'pending',
    query: '',
    stage: null,
    resultCount: 0,
    newCount: 0,
    duplicateCount: 0,
    invalidCount: 0,
    rejectedOutOfAreaCount: 0,
    enrichmentTotal: 0,
    enrichmentCompleted: 0,
    enrichmentFailed: 0,
    attempts: 0,
    error: null,
    skipReason: null,
    startedAt: null,
    completedAt: null,
    durationMs: 0,
  };
}

/** Upgrade an old single-type SearchRecord without losing its saved checkpoint. */
export function ensureCampaign(search: SearchRecord, timestamp = new Date().toISOString()): DiscoveryCampaign {
  if (search.campaign) return search.campaign;
  const types = normalizeBusinessTypes(search.config ?? {
    businessType: search.businessType,
    businessTypes: search.businessTypes,
  } as DiscoveryConfig);
  const campaign = createCampaign(search.id, types.length ? types : [search.businessType], search.config?.maxResults ?? Math.max(1, search.uniqueCount), search.startedAt || timestamp);
  const task = campaign.tasks[0];
  campaign.uniqueCount = search.uniqueCount;
  campaign.duplicateCount = search.duplicateCount ?? 0;
  if (task) {
    task.query = search.currentQuery || search.query;
    task.resultCount = search.uniqueCount + (search.duplicateCount ?? 0);
    task.newCount = search.uniqueCount;
    task.duplicateCount = search.duplicateCount ?? 0;
    task.attempts = Math.max(1, search.retryCount ?? 0);
    task.startedAt = search.startedAt;
    task.completedAt = search.completedAt;
    task.stage = search.currentPhase ?? null;
    task.status = legacyTaskStatus(search.status);
  }
  campaign.status = legacyCampaignStatus(search.status);
  campaign.currentBusinessType = task && task.status === 'running' ? task.businessType : null;
  campaign.completedAt = search.completedAt;
  search.businessTypes = campaign.selectedBusinessTypes;
  search.campaign = campaign;
  return campaign;
}

function legacyTaskStatus(status: SearchRecord['status']): BusinessTypeTask['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'completed-with-errors') return 'completed-with-errors';
  if (status === 'error' || status === 'failed') return 'failed';
  if (status === 'stopped' || status === 'cancelled') return 'skipped';
  return 'running';
}

function legacyCampaignStatus(status: SearchRecord['status']): DiscoveryCampaign['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'completed-with-errors') return 'completed-with-errors';
  if (status === 'error' || status === 'failed') return 'failed';
  if (status === 'stopped' || status === 'cancelled') return 'cancelled';
  if (status === 'paused') return 'paused';
  return 'running';
}

export function nextRunnableTask(campaign: DiscoveryCampaign): BusinessTypeTask | null {
  for (let index = Math.max(0, campaign.queueIndex); index < campaign.tasks.length; index += 1) {
    if (campaign.tasks[index].status === 'pending' || campaign.tasks[index].status === 'running') {
      campaign.queueIndex = index;
      return campaign.tasks[index];
    }
  }
  return null;
}

export function startTask(campaign: DiscoveryCampaign, task: BusinessTypeTask, query: string, timestamp = new Date().toISOString()): void {
  allocateTaskBudget(campaign, task);
  campaign.status = 'running';
  campaign.queueIndex = task.order;
  campaign.currentBusinessType = task.businessType;
  campaign.completedAt = null;
  campaign.updatedAt = timestamp;
  campaign.lastCheckpointAt = timestamp;
  task.status = 'running';
  task.query = query;
  task.error = null;
  task.skipReason = null;
  task.startedAt ??= timestamp;
  task.attempts += 1;
}

export function updateTaskStage(campaign: DiscoveryCampaign, phase: DiscoveryPhase, timestamp = new Date().toISOString()): void {
  const task = campaign.tasks[campaign.queueIndex];
  if (task?.status === 'running') task.stage = phase;
  campaign.updatedAt = timestamp;
  campaign.lastCheckpointAt = timestamp;
}

export function completeTask(
  campaign: DiscoveryCampaign,
  task: BusinessTypeTask,
  options: { enrichmentTotal?: number; enrichmentCompleted?: number; enrichmentFailed?: number } = {},
  timestamp = new Date().toISOString(),
): void {
  task.enrichmentTotal = options.enrichmentTotal ?? task.enrichmentTotal;
  task.enrichmentCompleted = options.enrichmentCompleted ?? task.enrichmentCompleted;
  task.enrichmentFailed = options.enrichmentFailed ?? task.enrichmentFailed;
  task.status = task.enrichmentFailed > 0 ? 'completed-with-errors' : 'completed';
  task.stage = 'COMPLETED';
  task.completedAt = timestamp;
  task.durationMs = duration(task.startedAt, timestamp);
  campaign.queueIndex = task.order + 1;
  campaign.currentBusinessType = null;
  syncCampaignTotals(campaign, campaign.uniqueCount, timestamp);
}

export function failTask(campaign: DiscoveryCampaign, task: BusinessTypeTask, error: string, timestamp = new Date().toISOString()): void {
  task.status = task.newCount > 0 ? 'completed-with-errors' : 'failed';
  task.stage = 'FAILED';
  task.error = error;
  task.completedAt = timestamp;
  task.durationMs = duration(task.startedAt, timestamp);
  campaign.queueIndex = task.order + 1;
  campaign.currentBusinessType = null;
  syncCampaignTotals(campaign, campaign.uniqueCount, timestamp);
}

export function retryTask(campaign: DiscoveryCampaign, businessType: string, timestamp = new Date().toISOString()): BusinessTypeTask | null {
  if (campaignRetryError(campaign, businessType)) return null;
  const normalized = businessType.trim().toLocaleLowerCase();
  const task = campaign.tasks.find((item) => item.businessType.toLocaleLowerCase() === normalized
    && (item.status === 'failed' || item.status === 'completed-with-errors' || item.status === 'skipped'
      || (item.status === 'completed' && campaign.perTypeMaxResults !== undefined && item.newCount < campaign.perTypeMaxResults)));
  if (!task) return null;
  task.status = 'pending';
  task.error = null;
  task.skipReason = null;
  task.completedAt = null;
  task.stage = null;
  task.attempts = 0;
  delete task.newResultLimit;
  campaign.queueIndex = task.order;
  campaign.currentBusinessType = null;
  campaign.status = 'queued';
  campaign.completedAt = null;
  campaign.stopRequested = false;
  campaign.updatedAt = timestamp;
  return task;
}

export function skipPendingTasks(campaign: DiscoveryCampaign, reason: BusinessTypeTask['skipReason'], timestamp = new Date().toISOString()): void {
  for (const task of campaign.tasks) {
    if (task.status !== 'pending') continue;
    task.status = 'skipped';
    task.skipReason = reason;
    task.completedAt = timestamp;
  }
  campaign.updatedAt = timestamp;
}

export function finishCampaign(campaign: DiscoveryCampaign, uniqueCount: number, stopped = false, timestamp = new Date().toISOString()): DiscoveryCampaign['status'] {
  syncCampaignTotals(campaign, uniqueCount, timestamp);
  campaign.currentBusinessType = null;
  campaign.completedAt = timestamp;
  if (stopped || campaign.stopRequested) campaign.status = 'cancelled';
  else {
    const successful = campaign.tasks.some((task) => task.status === 'completed' || task.status === 'completed-with-errors');
    const hasErrors = campaign.tasks.some((task) => task.status === 'failed' || task.status === 'completed-with-errors');
    campaign.status = hasErrors ? (successful ? 'completed-with-errors' : 'failed') : 'completed';
  }
  return campaign.status;
}

export function syncCampaignTotals(campaign: DiscoveryCampaign, uniqueCount: number, timestamp = new Date().toISOString()): void {
  campaign.uniqueCount = uniqueCount;
  campaign.duplicateCount = campaign.tasks.reduce((sum, task) => sum + task.duplicateCount, 0);
  campaign.invalidCount = campaign.tasks.reduce((sum, task) => sum + task.invalidCount, 0);
  campaign.enrichmentTotal = campaign.tasks.reduce((sum, task) => sum + task.enrichmentTotal, 0);
  campaign.enrichmentCompleted = campaign.tasks.reduce((sum, task) => sum + task.enrichmentCompleted, 0);
  campaign.enrichmentFailed = campaign.tasks.reduce((sum, task) => sum + task.enrichmentFailed, 0);
  campaign.updatedAt = timestamp;
  campaign.lastCheckpointAt = timestamp;
}

export function completedTaskCount(campaign: DiscoveryCampaign): number {
  return campaign.tasks.filter((task) => ['completed', 'completed-with-errors', 'failed', 'skipped'].includes(task.status)).length;
}

function duration(startedAt: string | null, completedAt: string): number {
  if (!startedAt) return 0;
  return Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
}
