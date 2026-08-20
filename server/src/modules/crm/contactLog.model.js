import mongoose from 'mongoose';

// How the conversation happened. `other` pairs with `channelLabel` so the list
// stays open-ended without turning the enum into free text.
export const CONTACT_CHANNELS = ['phone', 'email', 'whatsapp', 'in_person', 'letter', 'sms', 'other'];

/**
 * Kundenkontakthistorie: one logged exchange with a customer — who spoke to
 * whom, when, through which channel, what was agreed and what is still open.
 *
 * Distinct from `entityNote` on purpose: a note records a fact about a record,
 * this records a conversation. Hence `occurredAt` (when the call happened,
 * which is not when it was typed up) and a separate `employeeId` (the person
 * who spoke, who is not always the person entering it).
 */
const contactLogSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    // Optional links — the exchange shows up on each record it names.
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null, index: true },

    occurredAt: { type: Date, required: true, default: Date.now },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    channel: { type: String, enum: CONTACT_CHANNELS, required: true },
    channelLabel: { type: String, trim: true, maxlength: 60, default: null },

    subject: { type: String, trim: true, maxlength: 200, default: null },
    note: { type: String, required: true, maxlength: 5000 },
    agreements: { type: String, maxlength: 5000, default: null },
    openPoints: { type: String, maxlength: 5000, default: null },

    followUpAt: { type: Date, default: null },
    followUpTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Same edit window as entity notes: a logged conversation is a record, not
    // a draft, so it stops being rewritable a day after it was entered.
    editableUntil: { type: Date, required: true },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

contactLogSchema.index({ customerId: 1, occurredAt: -1 });
contactLogSchema.index({ followUpAt: 1 }, { sparse: true });
contactLogSchema.index({ isDeleted: 1 });

contactLogSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const ContactLogEntry = mongoose.model('ContactLogEntry', contactLogSchema);
export default ContactLogEntry;
