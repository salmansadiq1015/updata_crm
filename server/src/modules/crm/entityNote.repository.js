import EntityNote from './entityNote.model.js';

class EntityNoteRepository {
  async create(data) {
    const note = new EntityNote(data);
    return note.save();
  }

  async findById(id) {
    return EntityNote.findById(id).lean();
  }

  async findByEntity(entityType, entityId) {
    return EntityNote.find({ entityType, entityId })
      .sort({ isPinned: -1, createdAt: -1 })
      .lean();
  }

  async updateById(id, data) {
    return EntityNote.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return EntityNote.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }
}

const entityNoteRepository = new EntityNoteRepository();
export default entityNoteRepository;
