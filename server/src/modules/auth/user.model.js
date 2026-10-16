import mongoose from 'mongoose';

/**
 * Per-user defaults for the AI calling / AI SMS agent. Validated with the campaign
 * rules (user.validation.js parseAiAgentDefaults) before it is written, so every
 * value can be copied into a new campaign as-is. `null` = never configured.
 */
const aiAgentDefaultsSchema = new mongoose.Schema(
  {
    agentConfig: {
      agentName: { type: String, trim: true, maxlength: 120 },
      organizationName: { type: String, trim: true, maxlength: 200 },
      objective: { type: String, trim: true, maxlength: 1000 },
      language: { type: String, trim: true, maxlength: 10 },
      voice: { type: String, trim: true, maxlength: 40 },
      disclosure: { type: String, trim: true, maxlength: 2000 },
    },
    // Campaign-shaped questions (aiCalling question schema); validated by Joi.
    questions: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    schedule: {
      timezone: { type: String, trim: true, maxlength: 80 },
      callWindow: {
        start: { type: String, maxlength: 5 },
        end: { type: String, maxlength: 5 },
      },
      daysOfWeek: { type: [Number], default: undefined },
      maxAttemptsPerLead: { type: Number },
      retryDelayMinutes: { type: Number },
      maxCallsPerDay: { type: Number },
    },
    sms: {
      purpose: { type: String, enum: ['transactional', 'promotional', 'support'] },
      templateId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    updatedAt: { type: Date },
  },
  { _id: false },
);

/**
 * User schema.
 *
 * Stores identity, credentials, and account state. Sensitive fields
 * (passwordHash, tokens, lockout data) use select: false to prevent
 * accidental exposure in queries.
 *
 * Soft delete via isDeleted flag (same pattern as file.model.js).
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 255,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    // Anrede / gender — optional, null = "none". Only person-applicable values
    // (users are always individuals, unlike CRM customers which can be firms).
    salutation: {
      type: String,
      enum: ['herr', 'frau', null],
      default: null,
    },
    birthDate: {
      type: Date,
      default: null,
    },
    // Short code identifying the employee on documents and plans, e.g.
    // Kseniya Goncharuk = KSG, Timo Schweizer = TS.
    initials: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 5,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: null,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    position: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    street: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    // Optional second address line: c/o, Postfach, z.Hd. … (same as CRM customers)
    addressSupplement: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null,
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    zip: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
    },
    country: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'Schweiz',
    },
    language: {
      type: String,
      enum: ['de', 'en', 'fr', 'it'],
      default: 'de',
    },
    avatarFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      default: null,
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'pending_activation', 'deactivated', 'locked'],
      default: 'pending_activation',
      index: true,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockedUntil: {
      type: Date,
      default: null,
      select: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
      select: false,
    },
    activationTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    activationTokenExpires: {
      type: Date,
      default: null,
      select: false,
    },
    resetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    resetTokenExpires: {
      type: Date,
      default: null,
      select: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    preferences: {
      preferredDepartmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
      dashboard: {
        hiddenKpis: { type: [String], default: [] },
        hiddenTabs: { type: [String], default: [] },
      },
      // Per-user visibility of the object (site) detail registers/tabs.
      siteDetail: {
        hiddenTabs: { type: [String], default: [] },
      },
      // Personal start page — overrides the role's configured start page.
      startPage: { type: String, trim: true, maxlength: 200, default: null },
      // AI agent (calls + SMS) defaults used to prefill new campaigns.
      aiAgentDefaults: { type: aiAgentDefaultsSchema, default: null },
    },
    schedulingSkills: {
      type: [String],
      default: [],
      set: (values) => Array.isArray(values) ? values.map((v) => String(v).trim()).filter(Boolean) : [],
    },
    schedulingCertifications: {
      type: [String],
      default: [],
      set: (values) => Array.isArray(values) ? values.map((v) => String(v).trim()).filter(Boolean) : [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
userSchema.index({ role: 1 });
userSchema.index({ isDeleted: 1, status: 1 });
userSchema.index({ createdAt: -1 });
// The short code identifies one person, so it must stay unique — but only
// among live users: soft-deleted ones must not hold a code hostage.
userSchema.index(
  { initials: 1 },
  { unique: true, partialFilterExpression: { initials: { $type: 'string' }, isDeleted: false } },
);
// language_override points at a field no user carries, on purpose. MongoDB
// defaults it to `language`, and `language` here is the person's UI preference
// — so a colleague who chose German was indexed with the German stemmer while
// queries were stemmed as English, and searching a name returned nothing.
// Migration 005 rebuilds the index on existing databases.
userSchema.index(
  { firstName: 'text', lastName: 'text', email: 'text' },
  { weights: { email: 3, firstName: 2, lastName: 2 }, language_override: '_textLanguage' },
);

// --- Virtuals ---
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Backwards-compatible alias for existing middleware
userSchema.virtual('isActive').get(function () {
  return this.status === 'active';
});

// --- Instance Methods ---

/**
 * Check if password was changed after a given JWT timestamp.
 * Used by authenticate middleware to invalidate tokens after password change.
 */
userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
    return jwtTimestamp < changedTimestamp;
  }
  return false;
};

// --- Soft-delete pre-hook ---
userSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const User = mongoose.model('User', userSchema);
export default User;
