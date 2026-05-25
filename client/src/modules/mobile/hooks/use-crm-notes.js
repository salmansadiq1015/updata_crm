'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';
import { db, enqueueSync, getFailedSyncCount, getPendingSyncCount } from '../db/mobile-db';
import { SYNC_ENTITY_TYPE, SYNC_OPERATION, SYNC_PRIORITY, SYNC_STATUS } from '../constants/mobile-constants';
import { crmNoteService } from '../services/crm-note-service';
import { useSyncStore } from '../stores/sync-store';
import { useNetworkStatus } from './use-network-status';

export function useEntityNotes(entityType, entityId) {
  const notes = useLiveQuery(
    () => crmNoteService.getByEntity(entityType, entityId),
    [entityType, entityId],
    [],
  );

  return {
    notes,
    warnings: useMemo(
      () => notes.filter((note) => note.is_warning || note.category === 'warning' || note.is_pinned),
      [notes],
    ),
  };
}

export function useEntityWarningMap(entityType, entityIds) {
  const ids = useMemo(
    () => [...new Set((entityIds || []).filter(Boolean))],
    [entityIds],
  );
  const notes = useLiveQuery(
    () => crmNoteService.getWarningsForEntities(entityType, ids),
    [entityType, ids.join('|')],
    [],
  );

  return useMemo(() => {
    const map = new Map();
    notes.forEach((note) => {
      const existing = map.get(note.entity_id) || [];
      existing.push(note);
      map.set(note.entity_id, existing);
    });
    return map;
  }, [notes]);
}

export function useCreateCrmNote() {
  const isOnline = useNetworkStatus();

  return useCallback(async ({ entityType, entityId, text, category = 'general', isPinned = false, isWarning = false }) => {
    const payload = {
      text,
      category,
      isPinned,
      isWarning: isWarning || category === 'warning',
    };

    if (isOnline) {
      const note = await crmNoteService.create(entityType, entityId, payload);
      await db.crmNotes.put({
        ...note,
        sync_status: SYNC_STATUS.SYNCED,
        last_synced_at: new Date().toISOString(),
      });
      return note;
    }

    const note = await crmNoteService.createOffline(entityType, entityId, payload);
    await enqueueSync(
      SYNC_ENTITY_TYPE.NOTE,
      note.id,
      SYNC_OPERATION.CREATE,
      {
        entity_type: entityType,
        entity_id: entityId,
        data: payload,
      },
      SYNC_PRIORITY[SYNC_ENTITY_TYPE.NOTE],
    );
    const [pending, failed] = await Promise.all([getPendingSyncCount(), getFailedSyncCount()]);
    useSyncStore.getState().setCounts(pending, failed);
    return note;
  }, [isOnline]);
}
