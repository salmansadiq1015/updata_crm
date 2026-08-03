import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Presentation for the task board (Aufgaben nach Abteilungen).
    color: { type: String, trim: true, maxlength: 20, default: null },
    icon: { type: String, trim: true, maxlength: 40, default: null },
    sortOrder: { type: Number, default: 0 },
    // Scope flags: which areas a department applies to. QOP numbering only uses
    // commercial departments; the task board uses operational ones too.
    scopeQop: { type: Boolean, default: true },
    scopeTasks: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const Department = mongoose.model('Department', departmentSchema);
export default Department;
