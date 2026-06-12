'use client';

import { useMemo, useCallback, useState } from 'react';
import { AiEntityCard } from './ai-entity-card';
import { AiEntityCandidatePicker } from './ai-entity-candidate-picker';
import { getConfidenceTier } from '../../constants/ai-constants';

function getEntityType(entity) {
  return entity.type || entity.entityType;
}

function getEntityId(entity) {
  return entity._id || entity.id || entity.entityId || null;
}

function getEntityKey(entity, index) {
  return String(getEntityId(entity) || `${getEntityType(entity)}:${entity.startOffset ?? index}:${entity.value ?? ''}`);
}

function sortByConfidence(entities) {
  return [...entities].sort((a, b) => (b.confidence ?? 1) - (a.confidence ?? 1));
}

export function AiEntityList({ entities = [], onCorrectionsChange }) {
  const [corrections, setCorrections] = useState({});

  const sorted = useMemo(() => sortByConfidence(entities), [entities]);

  const handleCorrect = useCallback((key, type, value, entity) => {
    const correctedValue = String(value ?? '').trim();
    setCorrections((prev) => {
      const next = { ...prev };
      if (correctedValue) {
        next[key] = {
          entityId: getEntityId(entity),
          entityKey: key,
          entityType: type,
          correctedValue,
        };
      } else {
        delete next[key];
      }
      onCorrectionsChange?.(Object.values(next));
      return next;
    });
  }, [onCorrectionsChange]);

  return (
    <div className="flex flex-col divide-y divide-border">
      {sorted.map((entity, index) => {
        const type = getEntityType(entity);
        const key = getEntityKey(entity, index);
        return (
          <div key={key}>
            <AiEntityCard
              entity={{ ...entity, type }}
              entityKey={key}
              onCorrect={(entityKey, entityType, value) => handleCorrect(entityKey, entityType, value, entity)}
            />
            <AiEntityCandidatePicker
              entity={{ ...entity, type }}
              entityKey={key}
              selectedId={entity.resolvedId ? String(entity.resolvedId) : null}
              onSelect={(entityKey, entityType, candidate) => handleCorrect(entityKey, entityType, candidate.label, entity)}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Returns true if all low-confidence entities have been corrected.
 */
export function useEntitiesReady(entities = [], corrections = {}) {
  return useMemo(() => {
    const correctionList = Array.isArray(corrections) ? corrections : Object.values(corrections);
    const lowConfidence = sortByConfidence(entities).filter(
      (e) => getConfidenceTier(e.confidence ?? 1) === 'low',
    );
    return lowConfidence.every((e, index) => {
      const entityId = getEntityId(e);
      const entityKey = getEntityKey(e, index);
      const corrected = correctionList.find((c) =>
        (entityId && String(c.entityId) === String(entityId)) ||
        c.entityKey === entityKey
      )?.correctedValue ?? e.correctedValue;
      return corrected && corrected.trim().length > 0;
    });
  }, [entities, corrections]);
}
