import mongoose from 'mongoose';

/**
 * Role schema.
 *
 * Roles define a named set of permissions. System roles (seeded on first boot)
 * cannot be deleted. Custom roles can be created by admins.
 * Each user is assigned exactly one role.
 */
// Per-device UI defaults a Key User configures for a role: which page the role
// lands on, sidebar order/visibility and the task workspace defaults. Applied
// automatically to every user of the role; individual user preferences (where
// they exist) take precedence.
const roleUiDeviceSchema = new mongoose.Schema(
  {
    startPage: { type: String, trim: true, maxlength: 200, default: null },
    // Stable ids: group key (e.g. 'crm') or leaf href (e.g. '/tasks').
    sidebarOrder: { type: [String], default: undefined },
    hiddenModules: { type: [String], default: undefined },
    taskDefaults: {
      assigneeFilter: { type: String, trim: true, maxlength: 40, default: null }, // 'ALL' | 'ME' | userId
      savedView: { type: String, trim: true, maxlength: 40, default: null },      // none|dueToday|overdue|pool
      status: { type: String, trim: true, maxlength: 20, default: null },         // OPEN|…|ALL
      view: { type: String, trim: true, maxlength: 20, default: null },           // list|board|calendar|timeline
    },
  },
  { _id: false },
);

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 50,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 255,
      default: '',
    },
    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission',
      },
    ],
    isSystem: {
      type: Boolean,
      default: false,
    },
    isCustomized: {
      type: Boolean,
      default: false,
    },
    // Role-dependent start view (Key User configurable). `mobile` is reserved
    // for the Flutter app; the web client reads `desktop`.
    uiConfig: {
      desktop: { type: roleUiDeviceSchema, default: null },
      mobile: { type: roleUiDeviceSchema, default: null },
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
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

// Soft-delete filter
roleSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Role = mongoose.model('Role', roleSchema);
export default Role;
