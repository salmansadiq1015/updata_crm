'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { appointmentService } from '../../services/appointment-service';
import { useAppointmentMutations } from '../../hooks/use-appointment-mutations';
import { AppointmentStatusBadge } from './appointment-status-badge';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2,
  Send,
  XCircle,
  Phone,
  Mail,
  Clock,
  User,
  CheckCircle2,
  PlayCircle,
  CircleCheckBig,
  UserX,
} from 'lucide-react';
import { format } from 'date-fns';

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="text-foreground">{value}</span>
      </div>
    </div>
  );
}

export function AppointmentPanel({ assignmentId }) {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('scheduling:write');

  const { data: appointment, isLoading } = useQuery({
    queryKey: queryKeys.deploy.assignments.appointment(assignmentId),
    queryFn: () => appointmentService.getAppointment(assignmentId),
    enabled: !!assignmentId,
    staleTime: 30_000,
  });

  const { confirm, cancel, updateStatus } = useAppointmentMutations(assignmentId);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-start gap-2">
              <Skeleton className="h-3.5 w-3.5 rounded shrink-0 mt-0.5" />
              <Skeleton className="h-3" style={{ width: `${50 + (i * 12) % 45}%` }} />
            </div>
          ))}
        </div>
        <Separator />
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    );
  }

  if (!appointment) {
    return <p className="text-xs text-muted-foreground py-2">{t('deploy.appointments.noDetails', 'Keine Termindetails vorhanden')}</p>;
  }

  const canConfirm = ['PENDING'].includes(appointment.confirmationStatus);
  const canCancel = ['PENDING', 'SENT', 'CONFIRMED'].includes(appointment.confirmationStatus);
  const statusActions = [
    {
      status: 'CONFIRMED',
      label: t('deploy.appointments.markConfirmed', 'Bestätigt'),
      icon: CheckCircle2,
      visible: ['SENT', 'RESCHEDULED'].includes(appointment.confirmationStatus),
    },
    {
      status: 'IN_PROGRESS',
      label: t('deploy.appointments.markInProgress', 'Starten'),
      icon: PlayCircle,
      visible: ['CONFIRMED', 'SENT', 'RESCHEDULED'].includes(appointment.confirmationStatus),
    },
    {
      status: 'COMPLETED',
      label: t('deploy.appointments.markCompleted', 'Erledigt'),
      icon: CircleCheckBig,
      visible: ['IN_PROGRESS', 'CONFIRMED'].includes(appointment.confirmationStatus),
    },
    {
      status: 'NO_SHOW',
      label: t('deploy.appointments.markNoShow', 'No-Show'),
      icon: UserX,
      visible: ['SENT', 'CONFIRMED', 'IN_PROGRESS', 'RESCHEDULED'].includes(appointment.confirmationStatus),
    },
  ].filter((action) => action.visible);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('deploy.appointments.customerAppointment', 'Kundentermin')}
        </h4>
        <AppointmentStatusBadge status={appointment.confirmationStatus} />
      </div>

      <div className="space-y-1.5">
        <InfoRow icon={User} label={t('deploy.appointments.contact', 'Kontakt')} value={appointment.customerContactName} />
        <InfoRow icon={Phone} label={t('deploy.form.phone', 'Telefon')} value={appointment.customerContactPhone} />
        <InfoRow icon={Mail} label={t('deploy.form.email', 'E-Mail')} value={appointment.customerContactEmail} />
        <InfoRow icon={Clock} label={t('deploy.appointments.timeWindow', 'Zeitfenster')} value={appointment.appointmentWindow} />
        {appointment.customerNotes && (
          <p className="text-xs text-muted-foreground mt-1 pl-5">{appointment.customerNotes}</p>
        )}
      </div>

      {appointment.confirmationSentAt && (
        <p className="text-[10px] text-muted-foreground">
          {t('deploy.appointments.confirmationSent', 'Bestätigung gesendet')}: {format(new Date(appointment.confirmationSentAt), 'dd.MM.yyyy HH:mm')}
        </p>
      )}

      {appointment.statusHistory?.length > 0 && (
        <div className="space-y-1.5 rounded-md border bg-muted/20 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('deploy.appointments.history', 'Statusverlauf')}
          </p>
          {appointment.statusHistory.slice(-4).reverse().map((entry, index) => (
            <div key={`${entry.status}-${entry.changedAt || index}`} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="font-medium">{entry.status}</span>
              <span className="text-muted-foreground">
                {entry.changedAt ? format(new Date(entry.changedAt), 'dd.MM. HH:mm') : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {canWrite && (canConfirm || canCancel || statusActions.length > 0) && (
        <>
          <Separator />
          <div className="flex flex-wrap gap-2">
            {canConfirm && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex-1"
                onClick={() => confirm.mutate()}
                disabled={confirm.isPending}
              >
                {confirm.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                {t('deploy.appointments.confirm', 'Bestätigen')}
              </Button>
            )}
            {statusActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.status}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => updateStatus.mutate({ status: action.status })}
                  disabled={updateStatus.isPending}
                >
                  {updateStatus.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Icon className="h-3 w-3 mr-1" />}
                  {action.label}
                </Button>
              );
            })}
            {canCancel && (
              <Button
                variant="destructive"
                size="sm"
                className="text-xs"
                onClick={() => cancel.mutate({ reason: t('deploy.appointments.cancelledByDispatcher', 'Storniert durch Disponent') })}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                {t('deploy.appointments.cancelBtn', 'Absagen')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
