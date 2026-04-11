import VoiceSession from './voiceSession.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  userId: 'objectId',
  sessionType: 'exact',
  status: 'exact',
  language: 'exact',
  deviceType: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', '_id'];

class VoiceSessionRepository {
  async create(data) {
    const session = new VoiceSession(data);
    return session.save();
  }

  async findById(id) {
    return VoiceSession.findById(id).lean();
  }

  async findByIdWithEntities(id) {
    const session = await VoiceSession.findById(id).lean();
    if (!session) return null;

    const { default: VoiceSessionEntity } = await import('./voiceSessionEntity.model.js');
    const entities = await VoiceSessionEntity.find({ sessionId: id })
      .sort({ startOffset: 1 })
      .lean();

    return { ...session, entities };
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (filters.dateFrom) {
      if (!filter.createdAt) filter.createdAt = {};
      filter.createdAt.$gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      if (!filter.createdAt) filter.createdAt = {};
      filter.createdAt.$lte = new Date(filters.dateTo);
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await VoiceSession.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateById(id, data) {
    return VoiceSession.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async updateStatus(id, status, additionalData = {}) {
    return VoiceSession.findByIdAndUpdate(
      id,
      { status, ...additionalData },
      { new: true, runValidators: true },
    ).lean();
  }

  async softDelete(id) {
    return VoiceSession.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async countByUserId(userId, { dateFrom, dateTo } = {}) {
    const filter = { userId };
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    return VoiceSession.countDocuments(filter);
  }

  async findByUserIdAndStatus(userId, status) {
    return VoiceSession.find({ userId, status })
      .sort({ createdAt: -1 })
      .lean();
  }
}

const voiceSessionRepository = new VoiceSessionRepository();
export default voiceSessionRepository;
