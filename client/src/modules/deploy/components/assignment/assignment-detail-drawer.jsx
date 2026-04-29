'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { assignmentService } from '../../services/assignment-service';
import { useAssignmentMutations } from '../../hooks/use-assignment-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { AssignmentTypeBadge } from '../shared/assignment-type-badge';
import { AssignmentStatusBadge } from '../shared/assignment-status-badge';
import { PriorityIndicator } from '../shared/priority-indicator';
import { ASSIGNMENT_STATUS_META } from '../../constants/deploy-constants';
import { AppointmentPanel } from '../appointment/appointment-panel';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { DeployEmptyState } from '../shared/deploy-empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock, MapPin, FileText, User, Hash, Pencil, Trash2, Loader2,
  CalendarCheck, SearchX,
} from 'lucide-react';

function DetailRow({ icon: Icon, label, children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function AssignmentDetailDrawer({ assignmentId, open, onOpenChange, onEdit }) {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('scheduling:write');

  const { data: assignment, isLoading } = useQuery({
    queryKey: queryKeys.deploy.assignments.detail(assignmentId),
    queryFn: () => assignmentService.getAssignment(assignmentId),
    enabled: !!assignmentId && open,
    staleTime: 30_000,
  });

  const { remove } = useAssignmentMutations({
    onDelete: () => onOpenChange(false),
  });

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-5 w-5 text-primary" />
            {t('deploy.assignments.details', 'Einsatzdetails')}
          </SheetTitle>
          {assignment?.assignmentNumber && (
            <SheetDescription>#{assignment.assignmentNumber}</SheetDescription>
          )}
        </SheetHeader>

        <Separator />

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              {/* Title + badges skeleton */}
              <div className="space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
              <Separator />
              {/* Detail rows skeleton */}
              <div className="space-y-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-4 w-4 rounded shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-4" style={{ width: `${55 + (i * 10) % 40}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : assignment ? (
            <>
              {/* Title & badges */}
              <div className="space-y-2">
                {assignment.title && (
                  <h3 className="font-semibold text-lg">{assignment.title}</h3>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <AssignmentTypeBadge type={assignment.assignmentType} />
                  <AssignmentStatusBadge status={assignment.status} />
                  <PriorityIndicator priority={assignment.priority} />
                </div>
              </div>

              <Separator />

              {/* Details */}
              <div className="space-y-3">
                <DetailRow icon={Clock} label={t('deploy.detail.timePeriod', 'Zeitraum')}>
                  {format(new Date(assignment.startDatetime), 'EEE d. MMM yyyy, HH:mm', { locale: de })}
                  {' – '}
                  {format(new Date(assignment.endDatetime), 'HH:mm')}
                </DetailRow>

                <DetailRow icon={User} label={t('deploy.detail.employee', 'Mitarbeiter')}>
                  {assignment.employeeId?.firstName} {assignment.employeeId?.lastName}
                </DetailRow>

                {assignment.projectId && (
                  <DetailRow icon={FileText} label={t('deploy.detail.project', 'Projekt')}>
                    {assignment.projectId.name || assignment.projectId.projectNumber}
                  </DetailRow>
                )}

                {assignment.instructions && (
                  <DetailRow icon={FileText} label={t('deploy.detail.instructions', 'Anweisungen')}>
                    <p className="whitespace-pre-wrap text-sm">{assignment.instructions}</p>
                  </DetailRow>
                )}

                {assignment.assignmentNumber && (
                  <DetailRow icon={Hash} label={t('deploy.detail.number', 'Nummer')}>
                    {assignment.assignmentNumber}
                  </DetailRow>
                )}
              </div>

              {/* Appointment details */}
              {assignment.isCustomerAppointment && (
                <>
                  <Separator />
                  <AppointmentPanel assignmentId={assignment._id} />
                </>
              )}
            </>
          ) : (
            <DeployEmptyState
              icon={SearchX}
              title={t('deploy.assignments.notFound', 'Einsatz nicht gefunden')}
              description={t('deploy.empty.notFoundDesc', 'Der angeforderte Einsatz existiert nicht oder wurde gelöscht.')}
              compact
            />
          )}
        </div>

        {/* Footer actions */}
        {canWrite && assignment && (
          <>
            <Separator />
            <div className="px-5 py-3 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onEdit?.(assignment)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {t('deploy.common.edit', 'Bearbeiten')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => remove.mutate(assignment._id)}
                disabled={remove.isPending}
              >
                {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
