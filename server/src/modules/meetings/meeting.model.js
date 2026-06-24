import mongoose from 'mongoose';

export const MEETING_STATUSES = ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const MEETING_PARTICIPANT_ROLES = ['ORGANIZER', 'RESPONSIBLE', 'REQUIRED', 'OPTIONAL'];
export const MEETING_RSVP_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE'];
export const MEETING_ATTENDANCE_STATUSES = ['UNKNOWN', 'PRESENT', 'ABSENT', 'EXCUSED'];
export const ONLINE_MEETING_PROVIDERS = ['NONE', 'INTERNAL', 'MANUAL', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'ZOOM', 'OTHER'];
export const MEETING_DECISION_STATUSES = ['OPEN', 'CONFIRMED', 'REVOKED'];
export const MEETING_REMINDER_STATUSES = ['PENDING', 'SCHEDULED', 'SENT', 'CANCELLED', 'FAILED'];

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    displayName: { type: String, trim: true, maxlength: 255, default: '' },
    role: { type: String, enum: MEETING_PARTICIPANT_ROLES, default: 'REQUIRED' },
    rsvpStatus: { type: String, enum: MEETING_RSVP_STATUSES, default: 'PENDING' },
    attendanceStatus: { type: String, enum: MEETING_ATTENDANCE_STATUSES, default: 'UNKNOWN' },
    invitedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
  },
  { _id: false },
);

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 255, default: '' },
    content: { type: String, trim: true, maxlength: 10000, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const decisionSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 500, required: true },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: MEETING_DECISION_STATUSES, default: 'OPEN' },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const reminderSchema = new mongoose.Schema(
  {
    minutesBefore: { type: Number, min: 0, max: 10080, required: true },
    scheduledAt: { type: Date, default: null },
    scheduledNotificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledNotification', default: null },
    status: { type: String, enum: MEETING_REMINDER_STATUSES, default: 'PENDING' },
  },
  { _id: false },
);

const meetingSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 255, required: true },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    agenda: { type: String, trim: true, maxlength: 10000, default: '' },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, trim: true, maxlength: 80, default: 'Europe/Zurich' },
    status: { type: String, enum: MEETING_STATUSES, default: 'SCHEDULED' },
    location: { type: String, trim: true, maxlength: 500, default: '' },
    onlineMeeting: {
      provider: { type: String, enum: ONLINE_MEETING_PROVIDERS, default: 'NONE' },
      joinUrl: { type: String, trim: true, maxlength: 2000, default: '' },
      externalEventId: { type: String, trim: true, maxlength: 255, default: '' },
      createdInSystem: { type: Boolean, default: false },
    },
    participants: { type: [participantSchema], default: [] },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    taskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    attachmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FileMetadata' }],
    notes: { type: [noteSchema], default: [] },
    minutes: {
      summary: { type: String, trim: true, maxlength: 20000, default: '' },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      recordedAt: { type: Date, default: null },
    },
    decisions: { type: [decisionSchema], default: [] },
    reminders: { type: [reminderSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true, maxlength: 2000, default: '' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    version: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

meetingSchema.index({ startAt: 1, endAt: 1, isDeleted: 1 });
meetingSchema.index({ status: 1, startAt: 1, isDeleted: 1 });
meetingSchema.index({ 'participants.userId': 1, startAt: 1 }, { sparse: true });
meetingSchema.index({ projectId: 1, startAt: 1 }, { sparse: true });
meetingSchema.index({ customerId: 1, startAt: 1 }, { sparse: true });
meetingSchema.index({ taskIds: 1 }, { sparse: true });
meetingSchema.index({ title: 'text', agenda: 'text', description: 'text' });
meetingSchema.index({ createdBy: 1, isDeleted: 1 });

meetingSchema.pre('validate', function validateMeetingTiming() {
  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    this.invalidate('endAt', 'Meeting end time must be after start time');
  }
});

meetingSchema.pre(/^find/, function excludeSoftDeleted() {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Meeting = mongoose.model('Meeting', meetingSchema);
export default Meeting;
