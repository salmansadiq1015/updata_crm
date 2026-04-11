import mongoose from 'mongoose';

/**
 * Password history schema.
 *
 * Stores hashed previous passwords to prevent reuse.
 * Only insert and read operations -- never update.
 */
const passwordHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// Lookup: recent passwords for a user
passwordHistorySchema.index({ userId: 1, createdAt: -1 });

const PasswordHistory = mongoose.model('PasswordHistory', passwordHistorySchema);
export default PasswordHistory;
