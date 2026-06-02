import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { generateId } from '@/lib/utils/ids';
import { db } from '../db/mobile-db';
import { SYNC_STATUS } from '../constants/mobile-constants';
import { compressPhoto } from '../lib/photo-utils';

export const CRM_IMAGE_ENTITY_TYPES = Object.freeze({
  CUSTOMER: 'customer',
  SITE: 'site',
  INSTALLATION: 'installation',
});

/**
 * Resolve the CRM images endpoint for a polymorphic entity type.
 * entityType: 'customer' | 'site' | 'installation'
 */
export function resolveImageEndpoint(entityType, entityId) {
  switch (entityType) {
    case CRM_IMAGE_ENTITY_TYPES.CUSTOMER:
      return ENDPOINTS.CRM.CUSTOMER_IMAGES(entityId);
    case CRM_IMAGE_ENTITY_TYPES.SITE:
      return ENDPOINTS.CRM.SITE_IMAGES(entityId);
    case CRM_IMAGE_ENTITY_TYPES.INSTALLATION:
      return ENDPOINTS.CRM.INSTALLATION_IMAGES(entityId);
    default:
      throw new Error(`Unsupported CRM image entity type: ${entityType}`);
  }
}

function buildImageFormData(blob, { caption, category } = {}, fileName) {
  const form = new FormData();
  form.append('image', blob, fileName || 'crm-image.jpg');
  if (caption) form.append('caption', caption);
  if (category) form.append('category', category);
  return form;
}

export const crmImageService = {
  /**
   * Online path — compress and POST multipart to the CRM images endpoint.
   * The apiClient defaults to JSON, so the multipart header MUST be set explicitly.
   */
  async upload(entityType, entityId, file, { caption, category } = {}) {
    const blob = await compressPhoto(file);
    const form = buildImageFormData(blob, { caption, category }, `crm-image-${entityId}.jpg`);
    const res = await apiClient.post(
      resolveImageEndpoint(entityType, entityId),
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data?.data || res.data;
  },

  /**
   * Offline path — compress to the 2 MB target and persist the blob in Dexie
   * with PENDING_SYNC. The sync engine ('CRM_IMAGE' case) uploads on reconnect.
   */
  async captureOffline(entityType, entityId, { file, caption = null, category = 'general' } = {}) {
    const blob = await compressPhoto(file);
    const id = generateId();
    const record = {
      id,
      entity_type: entityType,
      entity_id: entityId,
      blob,
      caption,
      category,
      mime_type: blob.type || 'image/jpeg',
      status: SYNC_STATUS.PENDING_SYNC,
      created_at: new Date().toISOString(),
    };
    await db.crmImageQueue.put(record);
    return record;
  },

  getQueuedByEntity(entityType, entityId) {
    if (!entityType || !entityId) return Promise.resolve([]);
    return db.crmImageQueue
      .where('[entity_type+entity_id]')
      .equals([entityType, entityId])
      .sortBy('created_at');
  },
};
