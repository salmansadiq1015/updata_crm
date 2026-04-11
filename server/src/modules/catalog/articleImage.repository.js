import ArticleImage from './articleImage.model.js';

class ArticleImageRepository {
  async create(data) {
    const image = new ArticleImage(data);
    return image.save();
  }

  async findByArticleId(articleId) {
    return ArticleImage.find({ articleId }).sort({ sortOrder: 1 }).lean();
  }

  async deleteById(id) {
    return ArticleImage.findByIdAndDelete(id);
  }

  async deleteByArticleId(articleId) {
    return ArticleImage.deleteMany({ articleId });
  }
}

const articleImageRepository = new ArticleImageRepository();
export default articleImageRepository;
