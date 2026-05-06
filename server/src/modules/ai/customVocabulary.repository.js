import CustomVocabulary from './customVocabulary.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  language: 'exact',
  category: 'exact',
  status: 'exact',
  source: 'exact',
};

const ALLOWED_SORT_FIELDS = ['term', 'createdAt', '_id'];

class CustomVocabularyRepository {
  async create(data) {
    const vocab = new CustomVocabulary(data);
    return vocab.save();
  }

  async findById(id) {
    return CustomVocabulary.findById(id).lean();
  }

  async findAll({ language, category, status } = {}) {
    const filter = {};
    if (language) filter.language = language;
    if (category) filter.category = category;
    if (status) filter.status = status;
    return CustomVocabulary.find(filter)
      .sort({ term: 1 })
      .lean();
  }

  async findByTermAndLanguage(term, language) {
    return CustomVocabulary.findOne({ term, language }).lean();
  }

  async findActive(language) {
    return CustomVocabulary.find({ language, status: 'ACTIVE' })
      .sort({ term: 1 })
      .lean();
  }

  async updateById(id, data) {
    return CustomVocabulary.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return CustomVocabulary.findByIdAndUpdate(
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

    const docs = await CustomVocabulary.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }
}

const customVocabularyRepository = new CustomVocabularyRepository();
export default customVocabularyRepository;
