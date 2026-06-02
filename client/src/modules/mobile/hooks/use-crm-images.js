'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { enqueueSync, getFailedSyncCount, getPendingSyncCount } from '../db/mobile-db';
import { SYNC_ENTITY_TYPE, SYNC_OPERATION, SYNC_PRIORITY } from '../constants/mobile-constants';
import { crmImageService } from '../services/crm-image-service';
import { useSyncStore } from '../stores/sync-store';
import { useNetworkStatus } from './use-network-status';

/**
 * Live list of locally-queued (PENDING_SYNC) images for an entity.
 * Useful to surface "waiting for sync" thumbnails in capture UIs.
 */
export function useQueuedCrmImages(entityType, entityId) {
  return useLiveQuery(
    () => crmImageService.getQueuedByEntity(entityType, entityId),
    [entityType, entityId],
    [],
  );
}

/**
 * Capture a CRM entity image. Routes to the online multipart upload when
 * connected, otherwise compresses + queues in Dexie and enqueues a CRM_IMAGE
 * sync item that the sync engine flushes on reconnect.
 */
export function useCaptureCrmImage() {
  const isOnline = useNetworkStatus();

  return useCallback(async ({ entityType, entityId, file, caption = null, category = 'general' }) => {
    if (isOnline) {
      return crmImageService.upload(entityType, entityId, file, { caption, category });
    }

    const record = await crmImageService.captureOffline(entityType, entityId, {
      file,
      caption,
      category,
    });

    await enqueueSync(
      SYNC_ENTITY_TYPE.CRM_IMAGE,
      record.id,
      SYNC_OPERATION.CREATE,
      {
        entity_type: entityType,
        entity_id: entityId,
      },
      SYNC_PRIORITY[SYNC_ENTITY_TYPE.CRM_IMAGE],
    );

    const [pending, failed] = await Promise.all([getPendingSyncCount(), getFailedSyncCount()]);
    useSyncStore.getState().setCounts(pending, failed);
    return record;
  }, [isOnline]);
}
