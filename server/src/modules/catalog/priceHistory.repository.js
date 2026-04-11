import PriceHistory from './priceHistory.model.js';

class PriceHistoryRepository {
  async create(data) {
    const history = new PriceHistory(data);
    return history.save();
  }

  async bulkCreate(histories) {
    return PriceHistory.insertMany(histories);
  }

  async findByArticleId(articleId, { from, to } = {}) {
    const filter = { articleId };
    if (from || to) {
      filter.effectiveDate = {};
      if (from) filter.effectiveDate.$gte = new Date(from);
      if (to) filter.effectiveDate.$lte = new Date(to);
    }
    return PriceHistory.find(filter).sort({ effectiveDate: -1 }).lean();
  }

  async findByBatchId(batchId) {
    return PriceHistory.find({ batchId }).lean();
  }

  async findRollbackData(batchId) {
    const histories = await PriceHistory.find({ batchId }).lean();
    return histories.map((h) => ({
      articleId: h.articleId,
      oldPrice: h.oldPrice,
      newPrice: h.newPrice,
    }));
  }
}

const priceHistoryRepository = new PriceHistoryRepository();
export default priceHistoryRepository;
