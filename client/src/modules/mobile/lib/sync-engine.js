import {
  db,
  getPendingSyncItems,
  markSyncItemCompleted,
  markSyncItemFailed,
  clearCompletedSyncItems,
  getPendingSyncCount,
  getFailedSyncCount,
  getSyncMeta,
  setSyncMeta,
} from '../db/mobile-db';
import { SYNC_CONFIG, SYNC_QUEUE_STATUS } from '../constants/mobile-constants';
import { useSyncStore } from '../stores/sync-store';
import { isActuallyOnline } from './connectivity';

let syncInProgress = false;
let pollTimer = null;

export async function triggerSync() {
  if (syncInProgress) return;

  const online = await isActuallyOnline();
  if (!online) {
    useSyncStore.getState().setOffline();
    await updateCounts();
    return;
  }

  useSyncStore.getState().setOnline();

  try {
    syncInProgress = true;
    await processOutboundQueue();
    await pullInboundChanges();
    useSyncStore.getState().setSyncComplete();
  } catch (err) {
    console.error('Sync failed:', err);
    useSyncStore.getState().setSyncError();
  } finally {
    syncInProgress = false;
    await updateCounts();
    await clearCompletedSyncItems();
  }
}

async function processOutboundQueue() {
  const items = await getPendingSyncItems();
  if (items.length === 0) return;

  const store = useSyncStore.getState();
  store.setSyncing('Uploading changes...');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    store.setProgress(i + 1, items.length);

    if (item.retry_count >= SYNC_CONFIG.MAX_RETRIES) continue;

    const delay = getRetryDelay(item.retry_count);
    if (item.last_attempted_at) {
      const elapsed = Date.now() - new Date(item.last_attempted_at).getTime();
      if (elapsed < delay) continue;
    }

    try {
      await db.syncQueue.update(item.id, { status: SYNC_QUEUE_STATUS.IN_PROGRESS });
      await processItem(item);
      await markSyncItemCompleted(item.id);
    } catch (err) {
      await markSyncItemFailed(item.id, err.message, item.retry_count + 1);
    }
  }
}

async function processItem(item) {
  const { default: apiClient } = await import('@/lib/api/client');
  const { ENDPOINTS } = await import('@/lib/api/endpoints');

  switch (item.entity_type) {
    case 'WORK_REPORT':
      if (item.operation === 'CREATE') {
        await apiClient.post(
          ENDPOINTS.MOBILE.ORDER_REPORTS(item.payload.order_id),
          item.payload.data
        );
      } else if (item.operation === 'UPDATE') {
        await apiClient.put(
          ENDPOINTS.MOBILE.REPORT_BY_ID(item.entity_id),
          item.payload.data
        );
      }
      break;

    case 'TIME_ENTRY':
      if (item.operation === 'CREATE') {
        await apiClient.post(
          ENDPOINTS.MOBILE.ORDER_TIME_ENTRIES(item.payload.order_id),
          item.payload.data
        );
      } else if (item.operation === 'UPDATE') {
        await apiClient.put(
          ENDPOINTS.MOBILE.TIME_ENTRY_BY_ID(item.entity_id),
          item.payload.data
        );
      } else if (item.operation === 'DELETE') {
        await apiClient.delete(ENDPOINTS.MOBILE.TIME_ENTRY_BY_ID(item.entity_id));
      }
      break;

    case 'PHOTO':
      if (item.operation === 'CREATE') {
        const formData = new FormData();
        const photo = await db.photos.get(item.entity_id);
        if (photo?.local_file_blob) {
          formData.append('photo', photo.local_file_blob, `photo-${item.entity_id}.jpg`);
        }
        Object.entries(item.payload.metadata || {}).forEach(([k, v]) => {
          if (v != null) formData.append(k, String(v));
        });
        await apiClient.post(
          ENDPOINTS.MOBILE.ORDER_PHOTOS(item.payload.order_id),
          formData,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: SYNC_CONFIG.UPLOAD_TIMEOUT,
          }
        );
      } else if (item.operation === 'DELETE') {
        await apiClient.delete(ENDPOINTS.MOBILE.PHOTO_BY_ID(item.entity_id));
      }
      break;

    case 'CHAT_MESSAGE':
      if (item.operation === 'CREATE') {
        await apiClient.post(
          ENDPOINTS.MOBILE.PROJECT_CHAT(item.payload.project_id),
          item.payload.data
        );
      }
      break;

    case 'MATERIAL_ITEM':
      if (item.operation === 'CREATE' || item.operation === 'UPDATE') {
        await apiClient.put(
          ENDPOINTS.MOBILE.REPORT_BY_ID(item.payload.report_id),
          { materialItems: item.payload.data }
        );
      }
      break;

    case 'SMALL_ORDER':
      if (item.operation === 'CREATE') {
        await apiClient.post(
          ENDPOINTS.MOBILE.PROJECT_SMALL_ORDERS(item.payload.project_id),
          item.payload.data
        );
      } else if (item.operation === 'UPDATE') {
        await apiClient.put(
          ENDPOINTS.MOBILE.SMALL_ORDER_BY_ID(item.payload.project_id, item.entity_id),
          item.payload.data
        );
      }
      break;

    case 'DOCUMENT':
      if (item.operation === 'CREATE') {
        const formData = new FormData();
        const doc = await db.documents?.get(item.entity_id);
        if (doc?.file_blob) {
          formData.append('file', doc.file_blob, doc.file_name || 'document');
        }
        Object.entries(item.payload.metadata || {}).forEach(([k, v]) => {
          if (v != null) formData.append(k, String(v));
        });
        await apiClient.post(
          ENDPOINTS.MOBILE.ORDER_DOCUMENTS(item.payload.order_id),
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
      }
      break;

    default:
      console.warn('Unknown sync entity type:', item.entity_type);
  }
}

async function pullInboundChanges() {
  const { default: apiClient } = await import('@/lib/api/client');
  const { ENDPOINTS } = await import('@/lib/api/endpoints');

  const lastSync = await getSyncMeta('last_sync_timestamp');

  useSyncStore.getState().setSyncing('Downloading updates...');

  const response = await apiClient.post(ENDPOINTS.MOBILE.SYNC, {
    lastSyncTimestamp: lastSync,
    outbound: { workReports: [], timeEntries: [], photos: [], chatMessages: [], materialItems: [] },
  });

  const { syncTimestamp, inbound } = response;

  if (inbound?.orders?.length > 0) {
    await db.orders.bulkPut(
      inbound.orders.map((o) => ({
        ...o,
        last_synced_at: syncTimestamp,
      }))
    );
  }

  if (inbound?.notifications?.length > 0) {
    await db.notifications.bulkPut(inbound.notifications);
  }

  if (inbound?.catalogUpdates?.length > 0) {
    await db.catalogItems.bulkPut(inbound.catalogUpdates);
  }

  await setSyncMeta('last_sync_timestamp', syncTimestamp);
}

function getRetryDelay(retryCount) {
  return SYNC_CONFIG.RETRY_DELAYS[Math.min(retryCount, SYNC_CONFIG.RETRY_DELAYS.length - 1)] || 0;
}

async function updateCounts() {
  const pending = await getPendingSyncCount();
  const failed = await getFailedSyncCount();
  useSyncStore.getState().setCounts(pending, failed);
}

export function startSyncPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (navigator.onLine) triggerSync();
  }, SYNC_CONFIG.POLL_INTERVAL);
}

export function stopSyncPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function setupSyncListeners() {
  if (typeof window === 'undefined') return () => {};

  const onOnline = () => triggerSync();
  const onVisible = () => {
    if (document.visibilityState === 'visible') triggerSync();
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);

  startSyncPolling();

  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    stopSyncPolling();
  };
}
