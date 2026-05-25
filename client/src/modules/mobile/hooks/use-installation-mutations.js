'use client';

import { queryKeys } from '@/lib/query/keys';
import { generateId } from '@/lib/utils/ids';
import { db } from '../db/mobile-db';
import { SYNC_ENTITY_TYPE, SYNC_STATUS } from '../constants/mobile-constants';
import { installationService, normalizeInstallation } from '../services/installation-service';
import { useOfflineMutation } from './use-offline-mutation';

export function useInstallationMutations(siteId) {
  const keys = [
    queryKeys.mobile.installations.bySite(siteId),
    queryKeys.mobile.all(),
  ];

  const createInstallation = useOfflineMutation({
    mutationFn: async (data) => {
      const { nameplateCapture, ...payload } = data;
      const installation = await installationService.createInstallation(siteId, payload);
      let nameplateImage = null;
      let nameplateSyncStatus = nameplateCapture?.file ? SYNC_STATUS.SYNCED : null;
      if (nameplateCapture?.file && installation?.id) {
        try {
          nameplateImage = await installationService.uploadNameplate(installation.id, nameplateCapture.file);
        } catch {
          nameplateSyncStatus = SYNC_STATUS.SYNC_FAILED;
        }
      }
      await db.crmInstallations.put({
        ...installation,
        nameplate_image_id: nameplateImage?._id || nameplateImage?.id || null,
        nameplate_file_blob: nameplateSyncStatus === SYNC_STATUS.SYNC_FAILED ? nameplateCapture?.file : null,
        nameplate_thumbnail_blob: nameplateCapture?.thumbnail || null,
        nameplate_sync_status: nameplateSyncStatus,
        sync_status: SYNC_STATUS.SYNCED,
        last_synced_at: new Date().toISOString(),
      });
      return installation;
    },
    entityType: SYNC_ENTITY_TYPE.INSTALLATION_CAPTURE,
    invalidateKeys: keys,
    onOfflineWrite: async (data) => {
      const id = generateId();
      const now = new Date().toISOString();
      const installation = normalizeInstallation({
        id,
        site_id: siteId,
        ...data,
        updated_at: now,
      }, siteId);

      await db.crmInstallations.add({
        ...installation,
        nameplate_file_blob: data.nameplateCapture?.file || null,
        nameplate_thumbnail_blob: data.nameplateCapture?.thumbnail || null,
        nameplate_file_name: data.nameplateCapture?.fileName || null,
        nameplate_captured_at: data.nameplateCapture?.capturedAt || null,
        nameplate_ocr: data.nameplateCapture?.hints || null,
        nameplate_sync_status: data.nameplateCapture?.file ? SYNC_STATUS.PENDING_SYNC : null,
        sync_status: SYNC_STATUS.PENDING_SYNC,
        created_at: now,
        updated_at: now,
        last_synced_at: null,
      });
      const { nameplateCapture, ...payload } = data;

      return {
        entityId: id,
        operation: 'CREATE',
        payload: {
          site_id: siteId,
          data: payload,
          has_nameplate: Boolean(nameplateCapture?.file),
        },
        installation,
      };
    },
  });

  const updateInstallation = useOfflineMutation({
    mutationFn: async ({ id, data, baseUpdatedAt }) => {
      const { nameplateCapture, ...payload } = data;
      const installation = await installationService.updateInstallation(id, {
        ...payload,
        baseUpdatedAt,
      });
      let nameplateImage = null;
      let nameplateSyncStatus = nameplateCapture?.file ? SYNC_STATUS.SYNCED : null;
      if (nameplateCapture?.file && installation?.id) {
        try {
          nameplateImage = await installationService.uploadNameplate(installation.id, nameplateCapture.file);
        } catch {
          nameplateSyncStatus = SYNC_STATUS.SYNC_FAILED;
        }
      }
      await db.crmInstallations.put({
        ...installation,
        nameplate_image_id: nameplateImage?._id || nameplateImage?.id || null,
        nameplate_file_blob: nameplateSyncStatus === SYNC_STATUS.SYNC_FAILED ? nameplateCapture?.file : null,
        nameplate_thumbnail_blob: nameplateCapture?.thumbnail || null,
        nameplate_sync_status: nameplateSyncStatus,
        sync_status: SYNC_STATUS.SYNCED,
        last_synced_at: new Date().toISOString(),
      });
      return installation;
    },
    entityType: SYNC_ENTITY_TYPE.INSTALLATION_CAPTURE,
    invalidateKeys: keys,
    onOfflineWrite: async ({ id, data, baseUpdatedAt }) => {
      const existing = await db.crmInstallations.get(id);
      if (existing?.sync_status === SYNC_STATUS.PENDING_SYNC && !existing?.last_synced_at) {
        throw new Error('Diese Anlage wartet bereits auf die erste Synchronisierung.');
      }
      const now = new Date().toISOString();
      const { nameplateCapture, ...payload } = data;
      await db.crmInstallations.update(id, {
        ...normalizeInstallation({ ...existing, ...payload, id, site_id: siteId }, siteId),
        nameplate_file_blob: nameplateCapture?.file || existing?.nameplate_file_blob || null,
        nameplate_thumbnail_blob: nameplateCapture?.thumbnail || existing?.nameplate_thumbnail_blob || null,
        nameplate_file_name: nameplateCapture?.fileName || existing?.nameplate_file_name || null,
        nameplate_captured_at: nameplateCapture?.capturedAt || existing?.nameplate_captured_at || null,
        nameplate_ocr: nameplateCapture?.hints || existing?.nameplate_ocr || null,
        nameplate_sync_status: nameplateCapture?.file ? SYNC_STATUS.PENDING_SYNC : existing?.nameplate_sync_status || null,
        sync_status: SYNC_STATUS.PENDING_SYNC,
        updated_at: now,
      });

      return {
        entityId: id,
        operation: 'UPDATE',
        payload: {
          site_id: siteId,
          data: payload,
          base_updated_at: baseUpdatedAt || existing?.updated_at || existing?.last_synced_at || null,
          has_nameplate: Boolean(nameplateCapture?.file || existing?.nameplate_file_blob),
        },
      };
    },
  });

  return { createInstallation, updateInstallation };
}
