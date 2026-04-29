'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSchedulingStore } from '../stores/scheduling-store';
import { useAssignmentMutations } from './use-assignment-mutations';
import { showSuccess } from '@/lib/toast';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useUndoAction() {
  const { t } = useLanguage();
  const { pushUndo, popUndo, clearExpiredUndos } = useSchedulingStore();
  const intervalRef = useRef(null);
  const { move } = useAssignmentMutations({});

  useEffect(() => {
    intervalRef.current = setInterval(clearExpiredUndos, 5000);
    return () => clearInterval(intervalRef.current);
  }, [clearExpiredUndos]);

  const registerUndo = useCallback((action) => {
    pushUndo(action);

    toast((toastInstance) => (
      <div className="flex items-center gap-3">
        <span className="text-sm">{t('deploy.assignments.moved', 'Einsatz verschoben')}</span>
        <button
          className="text-xs font-semibold text-primary hover:underline"
          onClick={() => {
            const entry = popUndo();
            if (entry?.previousState) {
              move.mutate({
                id: entry.previousState.assignmentId,
                data: {
                  newEmployeeId: entry.previousState.employeeId,
                  newStartDatetime: entry.previousState.startDatetime,
                  newEndDatetime: entry.previousState.endDatetime,
                },
              });
            }
            toast.dismiss(toastInstance.id);
          }}
        >
          {t('deploy.assignments.undo', 'Rückgängig')}
        </button>
      </div>
    ), { duration: 30_000 });
  }, [pushUndo, popUndo, move, t]);

  return { registerUndo };
}
