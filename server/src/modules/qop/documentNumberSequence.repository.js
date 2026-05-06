import DocumentNumberSequence from './documentNumberSequence.model.js';

class DocumentNumberSequenceRepository {
  async create(data) {
    const sequence = new DocumentNumberSequence(data);
    return sequence.save();
  }

  async findById(id) {
    return DocumentNumberSequence.findById(id).lean();
  }

  async findAll() {
    return DocumentNumberSequence.find().lean();
  }

  async findByTypeAndDepartment(documentType, departmentId) {
    return DocumentNumberSequence.findOne({ documentType, departmentId }).lean();
  }

  async updateById(id, data) {
    return DocumentNumberSequence.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async resetAnnualSequences(year) {
    return DocumentNumberSequence.updateMany(
      { resetsAnnually: true, currentYear: { $lt: year } },
      { $set: { currentValue: 0, currentYear: year } },
    );
  }
}

const documentNumberSequenceRepository = new DocumentNumberSequenceRepository();
export default documentNumberSequenceRepository;
