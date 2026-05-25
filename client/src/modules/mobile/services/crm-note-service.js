import { ENDPOINTS } from '@/lib/api/endpoints';
import apiClient from '@/lib/api/client';
import { generateId } from '@/lib/utils/ids';
import { db } from '../db/mobile-db';
import { SYNC_STATUS } from '../constants/mobile-constants';

export const CRM_NOTE_ENTITY_TYPES = Object.freeze({
  CUSTOMER: 'customer',
  SITE: 'site',
  INSTALLATION: 'installation',
});

export const crmNoteService = {
  async create(entityType, entityId, payload) {
    const response = await apiClient.post(ENDPOINTS.MOBILE.NOTE(entityType, entityId), payload);
    return normalizeNote(response.data?.data || response.data, entityType, entityId);
  },

  async createOffline(entityType, entityId, payload) {
    const now = new Date().toISOString();
    const note = normalizeNote(
      {
        ...payload,
        id: generateId(),
        entity_type: entityType,
        entity_id: entityId,
        created_at: now,
        updated_at: now,
      },
      entityType,
      entityId,
    );

    await db.crmNotes.put({
      ...note,
      sync_status: SYNC_STATUS.PENDING_SYNC,
      last_synced_at: null,
      search_text: buildSearchText(note),
    });

    return note;
  },

  getByEntity(entityType, entityId) {
    if (!entityType || !entityId) return Promise.resolve([]);
    return db.crmNotes
      .where('[entity_type+entity_id]')
      .equals([entityType, entityId])
      .sortBy('created_at')
      .then(sortNotes);
  },

  async getWarningsForEntities(entityType, entityIds) {
    const ids = Array.isArray(entityIds) ? entityIds.filter(Boolean) : [];
    if (!entityType || ids.length === 0) return [];

    const notes = await db.crmNotes
      .where('[entity_type+entity_id]')
      .anyOf(ids.map((id) => [entityType, id]))
      .toArray();

    return sortNotes(notes.filter((note) => note.is_warning || note.category === 'warning' || note.is_pinned));
  },
};

export function normalizeNote(input = {}, fallbackEntityType = null, fallbackEntityId = null) {
  const id = input.id || input._id || generateId();
  const entityType = input.entity_type || input.entityType || fallbackEntityType;
  const entityId = input.entity_id || input.entityId || fallbackEntityId;
  const category = input.category || 'general';

  return {
    id,
    entity_type: entityType,
    entity_id: entityId,
    text: input.text || '',
    category,
    is_pinned: Boolean(input.is_pinned ?? input.isPinned),
    is_warning: Boolean(input.is_warning ?? input.isWarning ?? category === 'warning'),
    author_id: input.author_id || input.authorId || null,
    editable_until: input.editable_until || input.editableUntil || null,
    created_at: input.created_at || input.createdAt || new Date().toISOString(),
    updated_at: input.updated_at || input.updatedAt || new Date().toISOString(),
    sync_status: input.sync_status || input.syncStatus || SYNC_STATUS.SYNCED,
  };
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    if (a.is_warning !== b.is_warning) return a.is_warning ? -1 : 1;
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
}

function buildSearchText(note) {
  return [note.text, note.category].filter(Boolean).join(' ').toLowerCase();
}
