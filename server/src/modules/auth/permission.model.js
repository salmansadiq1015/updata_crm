import mongoose from 'mongoose';

/**
 * Permission schema.
 *
 * Each permission is a module:action pair (e.g., 'crm:read', 'projects:write').
 * Permissions are seeded on first boot and referenced by roles.
 */
const permissionSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      trim: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      validate: {
        validator: (value) => /^[a-z0-9][a-z0-9:_-]*$/.test(value),
        message: 'Permission action must use lowercase letters, numbers, colon, underscore, or hyphen.',
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: 255,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Unique compound: one permission per module+action
permissionSchema.index({ module: 1, action: 1 }, { unique: true });

// Virtual: the permission key string used for authorization checks
permissionSchema.virtual('key').get(function () {
  return `${this.module}:${this.action}`;
});

const Permission = mongoose.model('Permission', permissionSchema);
export default Permission;
