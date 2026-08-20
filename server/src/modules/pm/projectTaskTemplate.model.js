import mongoose from 'mongoose';
import { PROJECT_TYPES } from './project.model.js';

/**
 * Checklist of standard tasks to open with a project.
 *
 * The specification asks Projekt AI to create "Checkliste, Aufgaben und
 * Terminplanentwurf" per project type, and gives a worked example: a
 * geothermal heat pump must produce nine specific tasks. Which template
 * applies is decided from the trade content recognised on the quotation
 * (`matchTerms`), because the generic project types alone do not say whether
 * a borehole permit is needed.
 *
 * Quality AI will read the same templates for its closing checklist.
 */
const templateTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 1000 },
    // Working days after project start; drives the draft schedule.
    offsetDays: { type: Number, default: 0, min: 0, max: 365 },
    priority: { type: String, enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
    // Agent that should pick this task up once handoffs are wired.
    handoffTo: { type: String, default: null, maxlength: 60 },
    // Blocks the site start until done (Bohrbewilligung, Baugesuch…).
    blocksStart: { type: Boolean, default: false },
  },
  { _id: false },
);

const projectTaskTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 60 },
    name: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 1000 },
    projectType: { type: String, enum: PROJECT_TYPES, default: 'NEW_INSTALLATION' },
    // Lower wins when several templates match.
    priority: { type: Number, default: 100 },
    // Lower-case terms matched against recognised trade content and the title.
    matchTerms: [{ type: String, lowercase: true, trim: true, maxlength: 80 }],
    isFallback: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    tasks: [templateTaskSchema],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

projectTaskTemplateSchema.index({ priority: 1 });
projectTaskTemplateSchema.index({ isActive: 1, isDeleted: 1 });

projectTaskTemplateSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const ProjectTaskTemplate = mongoose.model('ProjectTaskTemplate', projectTaskTemplateSchema);
export default ProjectTaskTemplate;
