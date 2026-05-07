import SearchPreset from './searchPreset.model.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';

class SearchPresetService {
  async list(userId) {
    return SearchPreset.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  async create(userId, { name, filters }) {
    const existing = await SearchPreset.findOne({ userId, name });
    if (existing) throw new ConflictError(`Preset "${name}" already exists`);
    return SearchPreset.create({ userId, name, filters });
  }

  async delete(userId, presetId) {
    const preset = await SearchPreset.findOneAndDelete({ _id: presetId, userId });
    if (!preset) throw new NotFoundError('SearchPreset', presetId);
    return { deleted: true };
  }
}

export default new SearchPresetService();
