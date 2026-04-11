import MaterialLineItem from './materialLineItem.model.js';

class MaterialLineItemRepository {
  async create(data) {
    const item = new MaterialLineItem(data);
    return item.save();
  }

  async findByReportId(workReportId) {
    return MaterialLineItem.find({ workReportId })
      .sort({ sortOrder: 1 })
      .lean();
  }

  async bulkCreate(items) {
    return MaterialLineItem.insertMany(items);
  }

  async deleteByReportId(workReportId) {
    return MaterialLineItem.deleteMany({ workReportId });
  }
}

const materialLineItemRepository = new MaterialLineItemRepository();
export default materialLineItemRepository;
