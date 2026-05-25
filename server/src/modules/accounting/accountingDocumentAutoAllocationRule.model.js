import mongoose from 'mongoose';
import { DOCUMENT_TYPES } from './accountingDocument.model.js';

const autoAllocationRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    documentType: {
      type: String,
      enum: DOCUMENT_TYPES,
      default: null,
      index: true,
    },
    uploaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    projectReference: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
      index: true,
    },
    assignTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    priority: {
      type: Number,
      default: 100,
      min: 0,
      max: 10000,
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

autoAllocationRuleSchema.index({ isActive: 1, priority: 1, documentType: 1, uploaderId: 1, projectReference: 1 });

const AccountingDocumentAutoAllocationRule = mongoose.model(
  'AccountingDocumentAutoAllocationRule',
  autoAllocationRuleSchema,
);

export default AccountingDocumentAutoAllocationRule;
