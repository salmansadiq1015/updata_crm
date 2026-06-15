import {
  Wrench, Hammer, Settings, Flame, Search, MoreHorizontal,
  AlertTriangle, AlertOctagon, Clock, CalendarOff, Timer, Route,
} from 'lucide-react';

export const ASSIGNMENT_TYPE_META = Object.freeze({
  SERVICE_CALL: { labelKey: 'deploy.assignmentTypes.serviceCall', label: 'Serviceeinsatz', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-500/10', calendarColor: '#3b82f6' },
  PROJECT_WORK: { labelKey: 'deploy.assignmentTypes.projectWork', label: 'Projektarbeit', icon: Hammer, color: 'text-violet-500', bg: 'bg-violet-500/10', calendarColor: '#8b5cf6' },
  MAINTENANCE: { labelKey: 'deploy.assignmentTypes.maintenance', label: 'Wartung', icon: Settings, color: 'text-emerald-500', bg: 'bg-emerald-500/10', calendarColor: '#10b981' },
  INSTALLATION: { labelKey: 'deploy.assignmentTypes.installation', label: 'Installation', icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10', calendarColor: '#f97316' },
  INSPECTION: { labelKey: 'deploy.assignmentTypes.inspection', label: 'Inspektion', icon: Search, color: 'text-amber-500', bg: 'bg-amber-500/10', calendarColor: '#f59e0b' },
  OTHER: { labelKey: 'deploy.assignmentTypes.other', label: 'Sonstiges', icon: MoreHorizontal, color: 'text-slate-500', bg: 'bg-slate-500/10', calendarColor: '#64748b' },
});

export const ASSIGNMENT_STATUS_META = Object.freeze({
  PLANNED: { labelKey: 'deploy.assignmentStatus.planned', label: 'Geplant', dotColor: 'bg-slate-400', bgColor: 'bg-slate-500/10', textColor: 'text-slate-600' },
  CONFIRMED: { labelKey: 'deploy.assignmentStatus.confirmed', label: 'Bestätigt', dotColor: 'bg-blue-500', bgColor: 'bg-blue-500/10', textColor: 'text-blue-600' },
  IN_PROGRESS: { labelKey: 'deploy.assignmentStatus.inProgress', label: 'In Arbeit', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10', textColor: 'text-amber-600' },
  COMPLETED: { labelKey: 'deploy.assignmentStatus.completed', label: 'Abgeschlossen', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-600' },
  CANCELLED: { labelKey: 'deploy.assignmentStatus.cancelled', label: 'Storniert', dotColor: 'bg-gray-400', bgColor: 'bg-gray-500/10', textColor: 'text-gray-500' },
});

export const PRIORITY_META = Object.freeze({
  NORMAL: { labelKey: 'deploy.priorities.normal', label: 'Normal', color: 'text-slate-500', icon: null, bg: 'bg-slate-500/10' },
  HIGH: { labelKey: 'deploy.priorities.high', label: 'Hoch', color: 'text-amber-500', icon: AlertTriangle, bg: 'bg-amber-500/10' },
  URGENT: { labelKey: 'deploy.priorities.urgent', label: 'Dringend', color: 'text-red-500', icon: AlertOctagon, bg: 'bg-red-500/10' },
});

export const CONFIRMATION_STATUS_META = Object.freeze({
  PENDING: { labelKey: 'deploy.appointmentStatus.pending', label: 'Ausstehend', dotColor: 'bg-slate-400', bgColor: 'bg-slate-500/10' },
  SENT: { labelKey: 'deploy.appointmentStatus.sent', label: 'Gesendet', dotColor: 'bg-blue-500', bgColor: 'bg-blue-500/10' },
  CONFIRMED: { labelKey: 'deploy.appointmentStatus.confirmed', label: 'Bestätigt', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10' },
  RESCHEDULED: { labelKey: 'deploy.appointmentStatus.rescheduled', label: 'Verschoben', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10' },
  IN_PROGRESS: { labelKey: 'deploy.appointmentStatus.inProgress', label: 'In Arbeit', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10' },
  COMPLETED: { labelKey: 'deploy.appointmentStatus.completed', label: 'Erledigt', dotColor: 'bg-emerald-600', bgColor: 'bg-emerald-600/10' },
  NO_SHOW: { labelKey: 'deploy.appointmentStatus.noShow', label: 'No-Show', dotColor: 'bg-red-500', bgColor: 'bg-red-500/10' },
  CANCELLED: { labelKey: 'deploy.appointmentStatus.cancelled', label: 'Abgesagt', dotColor: 'bg-red-500', bgColor: 'bg-red-500/10' },
});

export const CONFLICT_TYPE_META = Object.freeze({
  DOUBLE_BOOKING: { labelKey: 'deploy.conflictTypes.doubleBooking', label: 'Doppelbuchung', icon: Clock, color: 'text-amber-500' },
  ABSENCE: { labelKey: 'deploy.conflictTypes.absence', label: 'Abwesenheit', icon: CalendarOff, color: 'text-red-500' },
  WORKING_HOURS: { labelKey: 'deploy.conflictTypes.workingHours', label: 'Arbeitszeiten', icon: Timer, color: 'text-amber-500' },
  TRAVEL_TIME: { labelKey: 'deploy.conflictTypes.travelTime', label: 'Fahrzeit', icon: Route, color: 'text-amber-500' },
  INACTIVE_EMPLOYEE: { labelKey: 'deploy.conflictTypes.inactiveEmployee', label: 'Inaktiver Mitarbeiter', icon: AlertOctagon, color: 'text-red-500' },
  SKILL_MISMATCH: { labelKey: 'deploy.conflictTypes.skillMismatch', label: 'Qualifikation', icon: AlertTriangle, color: 'text-amber-500' },
  CERTIFICATION_MISSING: { labelKey: 'deploy.conflictTypes.certificationMissing', label: 'Zertifikat', icon: AlertTriangle, color: 'text-amber-500' },
});

export const CONFLICT_SEVERITY_META = Object.freeze({
  HARD: { labelKey: 'deploy.conflictSeverity.hard', label: 'Hart', color: 'text-red-500', bg: 'bg-red-500/10', borderColor: 'border-red-500' },
  SOFT: { labelKey: 'deploy.conflictSeverity.soft', label: 'Weich', color: 'text-amber-500', bg: 'bg-amber-500/10', borderColor: 'border-amber-500' },
});

export const AVAILABILITY_TYPE_META = Object.freeze({
  WORKING: { labelKey: 'deploy.availability.working', label: 'Arbeitstag', color: 'bg-emerald-100 dark:bg-emerald-900/20' },
  VACATION: { labelKey: 'deploy.availability.vacation', label: 'Urlaub', color: 'bg-blue-100 dark:bg-blue-900/20' },
  SICK: { labelKey: 'deploy.availability.sick', label: 'Krank', color: 'bg-red-100 dark:bg-red-900/20' },
  PUBLIC_HOLIDAY: { labelKey: 'deploy.availability.publicHoliday', label: 'Feiertag', color: 'bg-purple-100 dark:bg-purple-900/20' },
  COMPANY_CLOSURE: { labelKey: 'deploy.availability.companyClosure', label: 'Betriebsschliessung', color: 'bg-gray-200 dark:bg-gray-800' },
  OTHER_ABSENCE: { labelKey: 'deploy.availability.otherAbsence', label: 'Andere Abwesenheit', color: 'bg-orange-100 dark:bg-orange-900/20' },
});

export const ALLOCATION_PERCENT_COLORS = Object.freeze({
  25: { bg: 'bg-blue-200 dark:bg-blue-800', text: 'text-blue-800 dark:text-blue-200', label: '25%' },
  50: { bg: 'bg-blue-400 dark:bg-blue-600', text: 'text-white', label: '50%' },
  75: { bg: 'bg-blue-600 dark:bg-blue-400', text: 'text-white', label: '75%' },
  100: { bg: 'bg-blue-800 dark:bg-blue-200', text: 'text-white dark:text-blue-900', label: '100%' },
});

// Read-only project work sourced from PM construction schedules
// (responsibleType: INTERNAL_TEAM). Surfaced in the deploy calendar so
// dispatchers see project work alongside deployments. Styled distinctly
// (dashed border / project color) and links to the owning project.
export const PM_SCHEDULE_META = Object.freeze({
  PHASE: { labelKey: 'deploy.pmSchedule.phase', label: 'Projektphase', calendarColor: '#0ea5e9' },
  MILESTONE: { labelKey: 'deploy.pmSchedule.milestone', label: 'Meilenstein', calendarColor: '#6366f1' },
});

export function translateMetaLabel(t, meta, fallback = '') {
  if (!meta) return fallback;
  return meta.labelKey ? t(meta.labelKey, meta.label || fallback) : meta.label || fallback;
}

export const ASSIGNMENT_TYPES = Object.keys(ASSIGNMENT_TYPE_META);
export const ASSIGNMENT_STATUSES = Object.keys(ASSIGNMENT_STATUS_META);
export const PRIORITIES = Object.keys(PRIORITY_META);
export const CONFIRMATION_STATUSES = Object.keys(CONFIRMATION_STATUS_META);

export const CALENDAR_VIEWS = Object.freeze({
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
});

export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 20;
export const SLOT_DURATION_MINUTES = 30;
export const ROW_HEIGHT = 72;
export const SIDEBAR_WIDTH = 220;
