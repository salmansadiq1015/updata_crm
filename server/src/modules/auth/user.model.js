import mongoose from 'mongoose';

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
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: null,
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
userSchema.index(
  { firstName: 'text', lastName: 'text', email: 'text' },
  { weights: { email: 3, firstName: 2, lastName: 2 } },
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
