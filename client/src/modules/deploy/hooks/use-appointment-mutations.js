'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentService } from '../services/appointment-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useAppointmentMutations(assignmentId, { onConfirm, onCancel, onReschedule, onUpdate } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.deploy.assignments.detail(assignmentId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.deploy.assignments.appointment(assignmentId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.deploy.dashboard.alerts() });
  };

  const update = useMutation({
    mutationFn: (data) => appointmentService.updateAppointment(assignmentId, data),
    onSuccess: (res) => { invalidate(); onUpdate?.(res); },
    onError: (err) => showError(err),
  });

  const confirm = useMutation({
    mutationFn: () => appointmentService.confirmAppointment(assignmentId),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('deploy.appointments.confirmed', 'Terminbestätigung gesendet'));
      onConfirm?.(res);
    },
    onError: (err) => showError(err),
  });

  const cancel = useMutation({
    mutationFn: (data) => appointmentService.cancelAppointment(assignmentId, data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('deploy.appointments.cancelled', 'Termin abgesagt'));
      onCancel?.(res);
    },
    onError: (err) => showError(err),
  });

  const reschedule = useMutation({
    mutationFn: (data) => appointmentService.rescheduleAppointment(assignmentId, data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('deploy.appointments.rescheduled', 'Termin verschoben'));
      onReschedule?.(res);
    },
    onError: (err) => showError(err),
  });

  return { update, confirm, cancel, reschedule };
}
