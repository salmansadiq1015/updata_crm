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

  /**
   * Active terms, most worth prompting first.
   *
   * Whatever consumes this has a budget — Whisper reads about 224 tokens of
   * prompt and ignores the rest — so the order decides what survives. Brand
   * names come first because they are what a speech model cannot guess:
   * "Viessmann" came back as "Wiesmann" while ordinary German words like
   * "Heizung" needed no help at all. Alphabetical order put the brands last
   * and cut exactly the terms that mattered.
   */
  async findActive(language) {
    const CATEGORY_RANK = { BRAND: 0, EQUIPMENT: 1, PART: 2, GENERAL: 3 };
    return CustomVocabulary.aggregate([
      { $match: { language, status: 'ACTIVE', isDeleted: { $ne: true } } },
      { $addFields: { _rank: { $ifNull: [{ $switch: {
        branches: Object.entries(CATEGORY_RANK).map(([category, rank]) => ({
          case: { $eq: ['$category', category] }, then: rank,
        })),
        default: 9,
      } }, 9] } } },
      { $sort: { _rank: 1, term: 1 } },
      { $project: { _rank: 0 } },
    ]);
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
