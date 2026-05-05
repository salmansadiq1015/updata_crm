'use client';

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getConfidenceTier, formatEntityLabel } from '../../constants/ai-constants';

const TIER_CONFIG = {
  high:   { icon: CheckCircle2, iconClass: 'text-green-500', labelClass: 'text-green-600 dark:text-green-400' },
  medium: { icon: AlertTriangle, iconClass: 'text-amber-500', labelClass: 'text-amber-600 dark:text-amber-400' },
  low:    { icon: XCircle,       iconClass: 'text-red-500',   labelClass: 'text-red-600 dark:text-red-400' },
};

export function AiEntityCard({ entity, onCorrect }) {
  const tier           = getConfidenceTier(entity.confidence ?? 1);
  const { icon: Icon, iconClass, labelClass } = TIER_CONFIG[tier];
  const displayValue   = entity.correctedValue ?? entity.normalizedValue ?? entity.value ?? '';
  const isEditable     = tier === 'low';

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-28 shrink-0 text-xs text-muted-foreground">
        {formatEntityLabel(entity.type)}
      </div>

      {isEditable ? (
        <Input
          defaultValue={displayValue}
          placeholder={`Enter ${formatEntityLabel(entity.type).toLowerCase()}…`}
          className="h-8 text-sm"
          onBlur={(e) => onCorrect?.(entity.type, e.target.value)}
          data-testid={`entity-input-${entity.type}`}
        />
      ) : (
        <span className="flex-1 text-sm font-medium">{displayValue}</span>
      )}

      <Icon
        className={cn('h-4 w-4 shrink-0', iconClass)}
        data-testid={`confidence-${tier}`}
        aria-label={tier}
      />
    </div>
  );
}
