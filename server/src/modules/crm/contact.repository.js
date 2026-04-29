import Contact from './contact.model.js';

class ContactRepository {
  async create(data) {
    const contact = new Contact(data);
    return contact.save();
  }

  async findById(id) {
    return Contact.findById(id).lean();
  }

  async findByCustomerId(customerId) {
    return Contact.find({ customerId })
      .sort({ isPrimary: -1, lastName: 1 })
      .lean();
  }

  async findPrimaryByCustomerId(customerId) {
    return Contact.findOne({ customerId, isPrimary: true }).lean();
  }

  async updateById(id, data) {
    return Contact.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Contact.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async unsetPrimaryForCustomer(customerId) {
    return Contact.updateMany(
      { customerId, isPrimary: true },
      { $set: { isPrimary: false } },
    );
  }

  async findAll(limit = 500) {
    return Contact.find()
      .populate('customerId', 'name customerNumber city postalCode street')
      .sort({ lastName: 1, firstName: 1 })
      .limit(limit)
      .lean();
  }

  async search(searchTerm, limit = 25) {
    return Contact.find({
      $or: [
        { firstName: { $regex: searchTerm, $options: 'i' } },
        { lastName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
      ],
    })
      .populate('customerId', 'name customerNumber')
      .limit(limit)
      .lean();
  }
}

const contactRepository = new ContactRepository();
export default contactRepository;
