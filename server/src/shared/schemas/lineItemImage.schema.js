import mongoose from 'mongoose';

/**
 * Optional product/line image attached to a document line item
 * (offer / quotation, order confirmation, invoice).
 *
 * - `fileId` references a FileMetadata record (image stored in the 'images'
 *   bucket via the shared file service). The PDF renderer loads the image
 *   bytes server-side through the file/storage services.
 * - `url` is an optional cached, pre-signed display URL used by the client
 *   editor for the thumbnail preview. It is never relied upon for rendering.
 */
const lineItemImageSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileMetadata', default: null },
    url: { type: String, trim: true, maxlength: 2000, default: '' },
    // Print size on the PDF — the editor offers Klein/Mittel/Gross per image.
    size: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
  },
  { _id: false },
);

export default lineItemImageSchema;
