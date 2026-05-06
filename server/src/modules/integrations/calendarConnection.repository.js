import CalendarConnection from './calendarConnection.model.js';

class CalendarConnectionRepository {
  async findByUserId(userId) {
    return CalendarConnection.find({ userId }).sort({ provider: 1 }).lean();
  }

  async findByUserIdAndProvider(userId, provider) {
    return CalendarConnection.findOne({ userId, provider }).lean();
  }

  async upsert(userId, provider, data) {
    return CalendarConnection.findOneAndUpdate(
      { userId, provider },
      { ...data, userId, provider },
      { returnDocument: 'after', upsert: true, runValidators: true },
    ).lean();
  }

  async updateTokens(userId, provider, { accessToken, refreshToken, tokenExpiresAt }) {
    return CalendarConnection.findOneAndUpdate(
      { userId, provider },
      { accessToken, refreshToken, tokenExpiresAt },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async updateStatus(userId, provider, status, errorMessage = null) {
    const update = { status };
    if (errorMessage) {
      update.lastErrorAt = new Date();
      update.lastErrorMessage = errorMessage;
    }
    return CalendarConnection.findOneAndUpdate(
      { userId, provider },
      update,
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async deleteByUserId(userId, provider) {
    return CalendarConnection.findOneAndDelete({ userId, provider });
  }

  async findExpiring(minutesUntilExpiry = 15) {
    const threshold = new Date(Date.now() + minutesUntilExpiry * 60 * 1000);
    return CalendarConnection.find({
      status: 'connected',
      tokenExpiresAt: { $lte: threshold, $ne: null },
    }).lean();
  }
}

const calendarConnectionRepository = new CalendarConnectionRepository();
export default calendarConnectionRepository;
