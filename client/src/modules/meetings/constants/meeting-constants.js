export const MEETING_STATUSES = ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const RSVP_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE'];
export const ATTENDANCE_STATUSES = ['UNKNOWN', 'PRESENT', 'ABSENT', 'EXCUSED'];
export const PARTICIPANT_ROLES = ['ORGANIZER', 'RESPONSIBLE', 'REQUIRED', 'OPTIONAL'];
export const ONLINE_PROVIDERS = ['NONE', 'INTERNAL', 'MANUAL', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'ZOOM', 'OTHER'];
export const TASK_PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const STATUS_META = {
  DRAFT: { label: 'Entwurf', labelEn: 'Draft', className: 'bg-slate-500/10 text-slate-600 border-slate-500/20' },
  SCHEDULED: { label: 'Geplant', labelEn: 'Scheduled', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  IN_PROGRESS: { label: 'Laufend', labelEn: 'In progress', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  COMPLETED: { label: 'Abgeschlossen', labelEn: 'Completed', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  CANCELLED: { label: 'Abgesagt', labelEn: 'Cancelled', className: 'bg-red-500/10 text-red-600 border-red-500/20' },
};

export const RSVP_META = {
  PENDING: { label: 'Offen', labelEn: 'Pending', className: 'bg-muted text-muted-foreground border-border' },
  ACCEPTED: { label: 'Zugesagt', labelEn: 'Accepted', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  DECLINED: { label: 'Abgelehnt', labelEn: 'Declined', className: 'bg-red-500/10 text-red-600 border-red-500/20' },
  TENTATIVE: { label: 'Vielleicht', labelEn: 'Tentative', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
};

export const ATTENDANCE_META = {
  UNKNOWN: { label: 'Unbekannt', labelEn: 'Unknown' },
  PRESENT: { label: 'Anwesend', labelEn: 'Present' },
  ABSENT: { label: 'Abwesend', labelEn: 'Absent' },
  EXCUSED: { label: 'Entschuldigt', labelEn: 'Excused' },
};
