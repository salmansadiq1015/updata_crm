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

  async findByOrderId(orderId) {
    return MaterialLineItem.find({ orderId })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();
  }

  async findByIdAndOrderId(id, orderId) {
    return MaterialLineItem.findOne({ _id: id, orderId }).lean();
  }

  async updateByIdAndOrderId(id, orderId, data) {
    return MaterialLineItem.findOneAndUpdate(
      { _id: id, orderId },
      data,
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async deleteByIdAndOrderId(id, orderId) {
    return MaterialLineItem.deleteOne({ _id: id, orderId });
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
