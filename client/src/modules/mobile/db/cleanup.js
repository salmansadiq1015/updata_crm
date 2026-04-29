import { db } from './mobile-db';
import { SYNC_CONFIG, SYNC_STATUS } from '../constants/mobile-constants';

export async function cleanupExpiredData() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SYNC_CONFIG.DATA_EXPIRY_DAYS);
  const cutoffISO = cutoff.toISOString();

  const expiredOrders = await db.orders
    .filter(
      (order) =>
        order.scheduled_start < cutoffISO &&
        order.last_synced_at != null
    )
    .toArray();

  const expiredOrderIds = expiredOrders.map((o) => o.id);
  if (expiredOrderIds.length === 0) return 0;

  const safeToDeleteIds = [];

  for (const orderId of expiredOrderIds) {
    const hasUnsyncedReports = await db.workReports
      .where('order_id').equals(orderId)
      .filter((r) => r.sync_status !== SYNC_STATUS.SYNCED)
      .count();
    const hasUnsyncedPhotos = await db.photos
      .where('order_id').equals(orderId)
      .filter((p) => p.sync_status !== SYNC_STATUS.SYNCED)
      .count();
    const hasUnsyncedTime = await db.timeEntries
      .where('order_id').equals(orderId)
      .filter((t) => t.sync_status !== SYNC_STATUS.SYNCED)
      .count();

    if (hasUnsyncedReports === 0 && hasUnsyncedPhotos === 0 && hasUnsyncedTime === 0) {
      safeToDeleteIds.push(orderId);
    }
  }

  if (safeToDeleteIds.length === 0) return 0;

  await db.transaction(
    'rw',
    [db.orders, db.workReports, db.materialItems, db.photos, db.timeEntries],
    async () => {
      const reports = await db.workReports
        .where('order_id')
        .anyOf(safeToDeleteIds)
        .toArray();
      const reportIds = reports.map((r) => r.id);

      if (reportIds.length > 0) {
        await db.materialItems
          .where('work_report_id')
          .anyOf(reportIds)
          .delete();
      }

      await db.workReports.where('order_id').anyOf(safeToDeleteIds).delete();
      await db.photos.where('order_id').anyOf(safeToDeleteIds).delete();
      await db.timeEntries.where('order_id').anyOf(safeToDeleteIds).delete();
      await db.orders.bulkDelete(safeToDeleteIds);
    }
  );

  return safeToDeleteIds.length;
}

export async function checkStorageQuota() {
  if (!navigator.storage?.estimate) return null;

  const { usage, quota } = await navigator.storage.estimate();
  const usageRatio = usage / quota;

  return {
    usage,
    quota,
    usageRatio,
    usageMB: Math.round(usage / (1024 * 1024)),
    quotaMB: Math.round(quota / (1024 * 1024)),
    isWarning: usageRatio >= SYNC_CONFIG.STORAGE_WARN_THRESHOLD,
  };
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;

  const isPersisted = await navigator.storage.persisted();
  if (isPersisted) return true;

  return navigator.storage.persist();
}
