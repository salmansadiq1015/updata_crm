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

  async updateByCode(code, data) {
    return UnitOfMeasure.findOneAndUpdate({ code }, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async deleteByCode(code) {
    return UnitOfMeasure.findOneAndDelete({ code });
  }

  async isReferenced(code) {
    // Lazy import to avoid circular dependencies
    const Article = (await import('./article.model.js')).default;
    const count = await Article.countDocuments({ unitOfMeasure: code, isDeleted: false });
    return count > 0;
  }
}

const unitOfMeasureRepository = new UnitOfMeasureRepository();
export default unitOfMeasureRepository;
