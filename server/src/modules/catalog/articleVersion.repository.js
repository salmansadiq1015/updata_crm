import ArticleVersion from './articleVersion.model.js';

class ArticleVersionRepository {
  async create(data) {
    const version = new ArticleVersion(data);
    return version.save();
  }

  async findByArticleId(articleId, { limit } = {}) {
    let query = ArticleVersion.find({ articleId }).sort({ version: -1 }).lean();
    if (limit) query = query.limit(limit);
    return query;
  }

  async findByArticleIdAndVersion(articleId, version) {
    return ArticleVersion.findOne({ articleId, version }).lean();
  }
}

const articleVersionRepository = new ArticleVersionRepository();
export default articleVersionRepository;
