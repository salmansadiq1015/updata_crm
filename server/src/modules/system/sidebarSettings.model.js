import mongoose from 'mongoose';

const sidebarSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'sidebar' },
  hiddenMenus: { type: [String], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('SidebarSettings', sidebarSettingsSchema);
