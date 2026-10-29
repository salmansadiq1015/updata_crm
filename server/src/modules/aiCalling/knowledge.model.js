import mongoose from 'mongoose';
import { KNOWLEDGE_TYPES } from './engine/knowledgeCompliance.js';

/**
 * Approved business knowledge for the voice agents. Company-wide (single-tenant):
 * products, prices, policies, promises and FAQs the agents may state.
 *
 * Lifecycle: draft → pending_approval → approved (admin) → published, where
 * "published" means included in an immutable KnowledgeVersion snapshot. Editing an
 * approved entry returns it to draft; the published snapshot keeps the old text
 * until the next publish. Agents only ever read snapshots.
 */
const { ObjectId } = mongoose.Schema.Types;

const priceSchema = new mongoose.Schema({
  amount: { type: Number, min: 0, default: null },
  currency: { type: String, trim: true, uppercase: true, maxlength: 3, default: null },
  unit: { type: String, trim: true, maxlength: 40, default: null }, // "month", "user", "visit"
  validUntil: { type: Date, default: null },
}, { _id: false });

const variantSchema = new mongoose.Schema({
  language: { type: String, trim: true, maxlength: 10, required: true },
  title: { type: String, trim: true, maxlength: 200, default: '' },
  content: { type: String, trim: true, maxlength: 4000, default: '' },
}, { _id: false });

export const knowledgeContentFields = {
  type: { type: String, enum: KNOWLEDGE_TYPES, required: true },
  title: { type: String, trim: true, maxlength: 200, required: true },
  content: { type: String, trim: true, maxlength: 4000, default: '' },
  price: { type: priceSchema, default: undefined },
  allowedPromises: { type: [{ type: String, trim: true, maxlength: 300 }], default: [] },
  forbiddenClaims: { type: [{ type: String, trim: true, maxlength: 300 }], default: [] },
  variants: { type: [variantSchema], default: [] },
  tags: { type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }], default: [] },
};

const entrySchema = new mongoose.Schema({
  ...knowledgeContentFields,
  status: { type: String, enum: ['draft', 'pending_approval', 'approved', 'archived'], default: 'draft', index: true },
  revision: { type: Number, default: 1 },
  submittedBy: { type: ObjectId, ref: 'User', default: null },
  submittedAt: { type: Date, default: null },
  approvedBy: { type: ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  approvedRevision: { type: Number, default: null },
  rejectionNote: { type: String, maxlength: 500, default: null },
  lastPublishedVersion: { type: Number, default: null },
  lastPublishedRevision: { type: Number, default: null },
  createdBy: { type: ObjectId, ref: 'User', required: true },
  updatedBy: { type: ObjectId, ref: 'User', required: true },
}, { timestamps: true });
entrySchema.index({ status: 1, type: 1, updatedAt: -1 });

const snapshotEntrySchema = new mongoose.Schema({
  entryId: { type: ObjectId, ref: 'KnowledgeEntry', required: true },
  revision: { type: Number, required: true },
  approvedBy: { type: ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  ...knowledgeContentFields,
}, { _id: false });

const versionSchema = new mongoose.Schema({
  version: { type: Number, required: true, unique: true },
  entries: { type: [snapshotEntrySchema], default: [] },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  publishedBy: { type: ObjectId, ref: 'User', required: true },
  publishedAt: { type: Date, required: true },
  rollbackOf: { type: Number, default: null },
}, { timestamps: true });

// Published versions are immutable: there is deliberately no update path.
function immutable() { throw new Error('Knowledge versions are immutable; publish a new version instead'); }
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace']) versionSchema.pre(op, immutable);
versionSchema.pre('save', function guard() { if (!this.isNew) throw new Error('Knowledge versions are immutable'); });

export const KnowledgeEntry = mongoose.model('KnowledgeEntry', entrySchema);
export const KnowledgeVersion = mongoose.model('KnowledgeVersion', versionSchema);
