'use client';

import { useState } from 'react';
import { useConflictList, useConflictMutations } from '../../hooks/use-conflict-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { CONFLICT_TYPE_META, CONFLICT_SEVERITY_META, translateMetaLabel } from '../../constants/deploy-constants';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Skeleton as BoneSkeleton } from 'boneyard-js/react';
import { DeployEmptyState } from '../shared/deploy-empty-state';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

function ConflictCard({ conflict, onResolve, t }) {
  const [reason, setReason] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const typeMeta = CONFLICT_TYPE_META[conflict.conflictType];
  const severityMeta = CONFLICT_SEVERITY_META[conflict.severity];
  const typeLabel = translateMetaLabel(t, typeMeta);
  const severityLabel = translateMetaLabel(t, severityMeta);

  return (
    <div className={cn('rounded-lg border p-4 space-y-2', severityMeta?.bg)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', severityMeta?.color)} />
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className={severityMeta?.color}>{severityLabel}</span>
              <span className="text-muted-foreground">{typeLabel}</span>
            </div>
            <p className="text-xs text-foreground mt-0.5">{conflict.description}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('deploy.conflicts.detectedAt', 'Erkannt')}: {format(new Date(conflict.detectedAt || conflict.createdAt), 'dd.MM.yyyy HH:mm')}
            </p>
          </div>
        </div>
        {!conflict.resolved && !showResolve && (
          <Button variant="outline" size="sm" className="text-xs shrink-0" onClick={() => setShowResolve(true)}>
            {t('deploy.common.resolve', 'Lösen')}
          </Button>
        )}
        {conflict.resolved && (
          <span className="text-xs text-emerald-500 font-medium">{t('deploy.common.resolved', 'Gelöst')}</span>
        )}
      </div>

      {showResolve && (
        <div className="space-y-2 pt-1">
          <FormField label={t('deploy.conflicts.overrideReason', 'Begründung')} required error={reason.length > 0 && reason.length < 10 ? t('deploy.conflicts.reasonRequired', 'Mindestens 10 Zeichen') : ''}>
            <Textarea
              className="text-xs min-h-[50px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('deploy.conflicts.resolvePlaceholder', 'Warum wird der Konflikt gelöst?')}
            />
          </FormField>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="text-xs"
              disabled={reason.length < 10}
              onClick={() => onResolve(conflict._id, reason)}
            >
              <ShieldCheck className="h-3 w-3 mr-1" />
              {t('deploy.common.confirm', 'Bestätigen')}
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setShowResolve(false); setReason(''); }}>
              {t('deploy.common.cancel', 'Abbrechen')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConflictList() {
  const { t } = useLanguage();
  const { data: conflictsData, isLoading } = useConflictList();
  const { resolve } = useConflictMutations();

  const conflicts = Array.isArray(conflictsData) ? conflictsData : conflictsData?.data || [];

  const handleResolve = (id, reason) => {
    resolve.mutate({ id, data: { overrideReason: reason } });
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">
        {t('deploy.conflicts.title', 'Konflikte')}
      </h1>

      <BoneSkeleton name="deploy-conflict-list" loading={isLoading}>
        {conflicts.length === 0 ? (
          <DeployEmptyState
            icon={ShieldCheck}
            title={t('deploy.empty.conflictsTitle', 'Alles im grünen Bereich')}
            description={t('deploy.empty.conflictsDesc', 'Es gibt derzeit keine aktiven Planungskonflikte.')}
          />
        ) : (
          <div className="space-y-3">
            {conflicts.map((conflict) => (
              <ConflictCard key={conflict._id} conflict={conflict} onResolve={handleResolve} t={t} />
            ))}
          </div>
        )}
      </BoneSkeleton>
    </div>
  );
}
