import mongoose from 'mongoose';

/**
 * Counter model for atomic auto-numbering.
 * Uses string _id: 'customer_number', 'installation_number', 'site_number:<customerId>'
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { timestamps: false, versionKey: false });

const Counter = mongoose.model('Counter', counterSchema);
export default Counter;
