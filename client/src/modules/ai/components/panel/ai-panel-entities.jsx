'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AiEntityList, useEntitiesReady } from '../entity/ai-entity-list';

export function AiPanelEntities({ session, onConfirm, onCancel, isConfirming }) {
  const [corrections, setCorrections] = useState({});
  const entities   = session?.entities ?? [];
  const isReady    = useEntitiesReady(entities, corrections);
  const transcript = session?.transcript?.corrected ?? session?.transcript?.raw ?? '';

  return (
    <div className="flex flex-col gap-4 px-2 py-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Extracted from your recording
      </p>

      {transcript && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed line-clamp-3">
          &quot;{transcript}&quot;
        </p>
      )}

      <AiEntityList
        entities={entities}
        onCorrectionsChange={setCorrections}
      />

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCancel}
          disabled={isConfirming}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => onConfirm(corrections)}
          disabled={!isReady || isConfirming}
        >
          {isConfirming ? 'Submitting…' : 'Confirm →'}
        </Button>
      </div>
    </div>
  );
}
