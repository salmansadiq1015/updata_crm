import PasswordHistory from './passwordHistory.model.js';

/**
 * Password history repository — insert and read only.
 */
class PasswordHistoryRepository {
  async create(userId, passwordHash) {
    const entry = new PasswordHistory({ userId, passwordHash });
    return entry.save();
  }

  /**
   * Get the N most recent password hashes for a user.
   */
  async findRecentByUser(userId, count = 5) {
    return PasswordHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(count)
      .lean();
  }
}

const passwordHistoryRepository = new PasswordHistoryRepository();
export default passwordHistoryRepository;
