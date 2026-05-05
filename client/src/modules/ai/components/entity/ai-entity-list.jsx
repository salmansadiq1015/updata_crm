'use client';

import { useMemo, useCallback, useState } from 'react';
import { AiEntityCard } from './ai-entity-card';
import { getConfidenceTier, CONFIDENCE } from '../../constants/ai-constants';

export function AiEntityList({ entities = [], onCorrectionsChange }) {
  const [corrections, setCorrections] = useState({});

  const sorted = useMemo(() =>
    [...entities].sort((a, b) => (b.confidence ?? 1) - (a.confidence ?? 1)),
  [entities]);

  const handleCorrect = useCallback((type, value) => {
    const next = { ...corrections, [type]: value };
    setCorrections(next);
    onCorrectionsChange?.(next);
  }, [corrections, onCorrectionsChange]);

  return (
    <div className="flex flex-col divide-y divide-border">
      {sorted.map((entity) => (
        <AiEntityCard
          key={`${entity.type}-${entity.value}`}
          entity={entity}
          onCorrect={handleCorrect}
        />
      ))}
    </div>
  );
}

/**
 * Returns true if all low-confidence entities have been corrected.
 */
export function useEntitiesReady(entities = [], corrections = {}) {
  return useMemo(() => {
    const lowConfidence = entities.filter(
      (e) => getConfidenceTier(e.confidence ?? 1) === 'low'
    );
    return lowConfidence.every((e) => {
      const corrected = corrections[e.type] ?? e.correctedValue;
      return corrected && corrected.trim().length > 0;
    });
  }, [entities, corrections]);
}
