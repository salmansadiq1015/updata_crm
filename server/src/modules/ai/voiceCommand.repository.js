import VoiceCommand from './voiceCommand.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  language: 'exact',
  isActive: 'boolean',
  actionType: 'exact',
};

const ALLOWED_SORT_FIELDS = ['intent', 'createdAt', '_id'];

class VoiceCommandRepository {
  async create(data) {
    const command = new VoiceCommand(data);
    return command.save();
  }

  async findById(id) {
    return VoiceCommand.findById(id).lean();
  }

  async findAll({ language, isActive } = {}) {
    const filter = {};
    if (language) filter.language = language;
    if (isActive !== undefined) filter.isActive = isActive;
    return VoiceCommand.find(filter)
      .sort({ intent: 1 })
      .lean();
  }

  async findByIntentAndLanguage(intent, language) {
    return VoiceCommand.findOne({ intent, language }).lean();
  }

  async findActive(language) {
    return VoiceCommand.find({ language, isActive: true })
      .sort({ intent: 1 })
      .lean();
  }

  async updateById(id, data) {
    return VoiceCommand.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return VoiceCommand.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await VoiceCommand.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }
}

const voiceCommandRepository = new VoiceCommandRepository();
export default voiceCommandRepository;
