import mongoose from 'mongoose';

export const TEMPLATE_LANGUAGES = ['de', 'fr', 'it', 'en'];
export const TEMPLATE_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];

const notificationTemplateSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    channel: { type: String, enum: TEMPLATE_CHANNELS, required: true },
    language: { type: String, enum: TEMPLATE_LANGUAGES, required: true, default: 'de' },
    version: { type: Number, required: true, default: 1 },
    isActive: { type: Boolean, default: true },
    subjectTemplate: { type: String, default: null },
    bodyTemplate: { type: String, required: true },
    bodyHtmlTemplate: { type: String, default: null },
    whatsappTemplateId: { type: String, default: null },
    variables: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationTemplateSchema.index({ type: 1, channel: 1, language: 1, isActive: 1 });
notificationTemplateSchema.index({ type: 1, channel: 1, language: 1, version: 1 }, { unique: true });
notificationTemplateSchema.index({ isDeleted: 1 });

notificationTemplateSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const NotificationTemplate = mongoose.model('NotificationTemplate', notificationTemplateSchema);
export default NotificationTemplate;
