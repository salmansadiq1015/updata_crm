'use client';

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { getConfidenceTier, formatEntityLabel } from '../../constants/ai-constants';

const TIER_CONFIG = {
  high:   { icon: CheckCircle2, iconClass: 'text-emerald-300' },
  medium: { icon: AlertTriangle, iconClass: 'text-amber-300' },
  low:    { icon: XCircle,       iconClass: 'text-rose-300' },
};

export function AiEntityCard({ entity, entityKey, onCorrect }) {
  const { t } = useLanguage();
  const entityType     = entity.type || entity.entityType;
  const tier           = getConfidenceTier(entity.confidence ?? 1);
  const { icon: Icon, iconClass } = TIER_CONFIG[tier];
  const displayValue   = entity.correctedValue ?? entity.normalizedValue ?? entity.value ?? '';
  const isEditable     = tier === 'low' || tier === 'medium';
  const label          = t(`ai.entity.${entityType}`, formatEntityLabel(entityType));

  return (
    <div className="flex items-center gap-3 border-b border-white/[0.08] px-3 py-3 last:border-b-0">
      <div className="w-28 shrink-0 text-xs font-medium text-slate-400">
        {label}
      </div>

      {isEditable ? (
        <Input
          defaultValue={displayValue}
          placeholder={t('ai.entity.enter', 'Enter {field}...', { field: label.toLowerCase() })}
          className="h-9 border-white/10 bg-slate-950/40 text-sm text-white placeholder:text-slate-500"
          onBlur={(e) => onCorrect?.(entityKey, entityType, e.target.value)}
          data-testid={`entity-input-${entityType}`}
        />
      ) : (
        <span className="flex-1 text-sm font-medium text-slate-100">{displayValue}</span>
      )}

      <Icon
        className={cn('h-4 w-4 shrink-0', iconClass)}
        data-testid={`confidence-${tier}`}
        aria-label={tier}
      />
    </div>
  );
}
