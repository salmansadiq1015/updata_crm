import UnitOfMeasure from './unitOfMeasure.model.js';

class UnitOfMeasureRepository {
  async create(data) {
    const unit = new UnitOfMeasure(data);
    return unit.save();
  }

  async findByCode(code) {
    return UnitOfMeasure.findOne({ code }).lean();
  }

  async findAll() {
    return UnitOfMeasure.find().sort({ code: 1 }).lean();
  }

  async usageCountsByCode() {
    const Article = (await import('./article.model.js')).default;
    const rows = await Article.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$unitOfMeasure', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id, row.count]));
  }

  async updateByCode(code, data) {
    return UnitOfMeasure.findOneAndUpdate({ code }, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async deleteByCode(code) {
    return UnitOfMeasure.findOneAndDelete({ code });
  }

  async isReferenced(code) {
    return (await this.referenceCount(code)) > 0;
  }

  async referenceCount(code) {
    const Article = (await import('./article.model.js')).default;
    return Article.countDocuments({ unitOfMeasure: code, isDeleted: false });
  }
}

const unitOfMeasureRepository = new UnitOfMeasureRepository();
export default unitOfMeasureRepository;
