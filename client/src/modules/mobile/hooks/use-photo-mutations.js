'use client';

import { queryKeys } from '@/lib/query/keys';
import { photoService } from '../services/photo-service';
import { db } from '../db/mobile-db';
import { useOfflineMutation } from './use-offline-mutation';
import { SYNC_STATUS, SYNC_ENTITY_TYPE } from '../constants/mobile-constants';
import { compressPhoto, generateThumbnail, captureGeoLocation } from '../lib/photo-utils';
import toast from 'react-hot-toast';

export function usePhotoMutations(orderId) {
  const keys = [queryKeys.mobile.photos.byOrder(orderId)];

  const uploadPhoto = useOfflineMutation({
    mutationFn: async ({ file, category, caption, workReportId }) => {
      const compressed = await compressPhoto(file);
      const geo = await captureGeoLocation();
      const formData = new FormData();
      formData.append('photo', compressed, `photo-${Date.now()}.jpg`);
      formData.append('category', category);
      if (caption) formData.append('caption', caption);
      if (workReportId) formData.append('workReportId', workReportId);
      if (geo?.latitude) formData.append('latitude', String(geo.latitude));
      if (geo?.longitude) formData.append('longitude', String(geo.longitude));
      formData.append('capturedAt', new Date().toISOString());
      return photoService.uploadPhoto(orderId, formData);
    },
    entityType: SYNC_ENTITY_TYPE.PHOTO,
    invalidateKeys: keys,
    onOfflineWrite: async ({ file, category, caption, workReportId }) => {
      const compressed = await compressPhoto(file);
      const thumbnail = await generateThumbnail(file);
      const geo = await captureGeoLocation();
      const id = crypto.randomUUID();
      const photo = {
        id,
        order_id: orderId,
        work_report_id: workReportId || null,
        local_file_blob: compressed,
        thumbnail_blob: thumbnail,
        category,
        caption: caption || '',
        has_annotations: false,
        annotation_data: null,
        latitude: geo?.latitude || null,
        longitude: geo?.longitude || null,
        captured_at: new Date().toISOString(),
        file_size_bytes: compressed.size,
        sync_status: SYNC_STATUS.PENDING_SYNC,
      };
      await db.photos.add(photo);
      return {
        entityId: id,
        operation: 'CREATE',
        payload: {
          order_id: orderId,
          metadata: {
            category,
            caption: caption || '',
            workReportId: workReportId || '',
            latitude: geo?.latitude || '',
            longitude: geo?.longitude || '',
            capturedAt: new Date().toISOString(),
          },
        },
        ...photo,
      };
    },
    onSuccess: () => toast.success('Foto gespeichert'),
    onError: (err) => toast.error(err.message),
  });

  const deletePhoto = useOfflineMutation({
    mutationFn: (photoId) => photoService.deletePhoto(photoId),
    entityType: SYNC_ENTITY_TYPE.PHOTO,
    invalidateKeys: keys,
    onOfflineWrite: async (photoId) => {
      await db.photos.delete(photoId);
      return { entityId: photoId, operation: 'DELETE', payload: { order_id: orderId } };
    },
    onSuccess: () => toast.success('Foto gelöscht'),
    onError: (err) => toast.error(err.message),
  });

  return { uploadPhoto, deletePhoto };
}
