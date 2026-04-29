import Dexie from 'dexie';

export const db = new Dexie('mb-mobile');

db.version(1).stores({
  orders: '&id, order_number, status, priority, scheduled_start, last_synced_at',
  workReports: '&id, order_id, status, sync_status, updated_at',
  materialItems: '&id, work_report_id, sync_status',
  photos: '&id, order_id, work_report_id, category, sync_status',
  timeEntries: '&id, order_id, date, activity_type, release_status, sync_status',
  chatMessages: '&id, project_id, sent_at, sync_status',
  catalogItems: '&id, catalog_source, description',
  notifications: '&id, notification_type, is_read, received_at',
  syncQueue: '&id, entity_type, entity_id, [status+priority], created_at',
  syncMeta: '&key',
});

export async function getSyncMeta(key) {
  const record = await db.syncMeta.get(key);
  return record?.value ?? null;
}

export async function setSyncMeta(key, value) {
  await db.syncMeta.put({ key, value });
}

export async function enqueueSync(entityType, entityId, operation, payload, priority) {
  const id = crypto.randomUUID();
  await db.syncQueue.add({
    id,
    entity_type: entityType,
    entity_id: entityId,
    operation,
    payload,
    status: 'QUEUED',
    priority,
    retry_count: 0,
    error_message: null,
    created_at: new Date().toISOString(),
    last_attempted_at: null,
  });
  return id;
}

export async function getPendingSyncItems() {
  return db.syncQueue
    .where('status')
    .anyOf('QUEUED', 'FAILED')
    .sortBy('priority');
}

export async function markSyncItemCompleted(id) {
  await db.syncQueue.update(id, {
    status: 'COMPLETED',
    last_attempted_at: new Date().toISOString(),
  });
}

export async function markSyncItemFailed(id, errorMessage, retryCount) {
  await db.syncQueue.update(id, {
    status: 'FAILED',
    error_message: errorMessage,
    retry_count: retryCount,
    last_attempted_at: new Date().toISOString(),
  });
}

export async function clearCompletedSyncItems(olderThanDays = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const cutoffISO = cutoff.toISOString();

  await db.syncQueue
    .where('status')
    .equals('COMPLETED')
    .filter((item) => item.created_at < cutoffISO)
    .delete();
}

export async function getPendingSyncCount() {
  return db.syncQueue
    .where('status')
    .anyOf('QUEUED', 'IN_PROGRESS', 'FAILED')
    .count();
}

export async function getFailedSyncCount() {
  return db.syncQueue.where('status').equals('FAILED').count();
}
